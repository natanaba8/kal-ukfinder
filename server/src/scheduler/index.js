import cron from 'node-cron';

import { pruneExpiredSessions } from '../auth/sessions.js';
import { config } from '../config.js';
import { collectMany } from '../content/engine.js';
import { createLogger } from '../logger.js';
import { pruneItems } from '../store/items.js';
import { pruneJobs } from '../store/jobs.js';
import { pruneRuns } from '../store/scrape-logs.js';
import { activeSources, dueSources } from '../store/sources.js';

const log = createLogger('scheduler');

/**
 * Per-source scheduling (pr.md §13).
 *
 * The tick runs every minute and only collects sources whose own interval has
 * elapsed, so one source can refresh every 15 minutes and another daily without
 * either blocking the other. Failing sources back off exponentially — that
 * logic lives in `dueSources` so it is testable on its own.
 */

let running = false;
let tasks = [];

export const isRunning = () => running;

export const tick = async ({ triggeredBy = 'scheduler' } = {}) => {
  if (running) {
    log.warn('previous run still in progress, skipping this tick');
    return { skipped: true };
  }

  const due = await dueSources();
  if (due.length === 0) return { due: 0, results: [] };

  running = true;
  const started = Date.now();

  try {
    log.info(`collecting ${due.length} source(s)`);
    const results = await collectMany(due, { concurrency: config.ingest.concurrency, triggeredBy });

    const totals = results.reduce(
      (accumulator, result) => ({
        new: accumulator.new + result.itemsNew,
        updated: accumulator.updated + result.itemsUpdated,
        duplicate: accumulator.duplicate + result.itemsDuplicate,
        failed: accumulator.failed + (result.status === 'failed' ? 1 : 0),
      }),
      { new: 0, updated: 0, duplicate: 0, failed: 0 },
    );

    log.info(
      `done in ${Math.round((Date.now() - started) / 1000)}s — ${totals.new} new, ${totals.duplicate} duplicate, ${totals.failed} source(s) failed`,
    );

    return { due: due.length, totals, results };
  } finally {
    running = false;
  }
};

/** Collect every active source now, regardless of when it last ran. */
export const collectAll = async ({ triggeredBy = 'cli' } = {}) => {
  const sources = await activeSources();
  const results = await collectMany(sources, { concurrency: config.ingest.concurrency, triggeredBy });
  return { sources: sources.length, results };
};

const housekeeping = async () => {
  const removed = {
    items: await pruneItems(config.ingest.retentionDays),
    jobs: await pruneJobs(config.ingest.retentionDays),
    runs: await pruneRuns(30),
    sessions: await pruneExpiredSessions(),
  };

  const total = Object.values(removed).reduce((sum, value) => sum + value, 0);
  if (total > 0) log.info(`housekeeping removed ${JSON.stringify(removed)}`);
};

export const startScheduler = () => {
  if (!config.ingest.enabled) {
    log.info('scheduler disabled (INGEST_ENABLED=false)');
    return;
  }

  tasks.push(
    cron.schedule('* * * * *', async () => {
      tick().catch((error) => log.error(`tick failed: ${error.message}`));
    }),
  );

  tasks.push(cron.schedule('17 3 * * *', housekeeping));

  log.info('scheduler started — each source runs on its own interval');
};

export const stopScheduler = () => {
  for (const task of tasks) task.stop();
  tasks = [];
};
