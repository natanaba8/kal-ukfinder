/**
 * Scheduled work for the serverless deployment.
 *
 * `server/src/scheduler/index.js` runs a node-cron tick every minute, which needs
 * a process that stays alive. A Vercel function does not, so Vercel Cron calls
 * these endpoints instead and each invocation does one pass:
 *
 *   GET /api/cron/ingest  — collect every source whose interval has elapsed
 *   GET /api/cron/digest  — send the daily briefing
 *   GET /api/cron/clean   — prune old items, jobs, runs and expired sessions
 *
 * Schedules live in `vercel.json`.
 */
import { config as appConfig } from '../../server/src/config.js';
import { createLogger } from '../../server/src/logger.js';
import { runDigest } from '../../server/src/notifications/digest.js';
import { pruneExpiredSessions } from '../../server/src/auth/sessions.js';
import { pruneItems } from '../../server/src/store/items.js';
import { pruneJobs } from '../../server/src/store/jobs.js';
import { pruneRuns } from '../../server/src/store/scrape-logs.js';
import { tick } from '../../server/src/scheduler/index.js';

const log = createLogger('cron');

/**
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set in
 * the project's environment. Without that variable these endpoints would be open
 * to anyone who guessed the path, so refuse to run rather than run unprotected.
 */
const authorised = (request) => {
  if (!appConfig.cronSecret) return false;
  return (request.headers.authorization ?? '') === `Bearer ${appConfig.cronSecret}`;
};

const JOBS = {
  ingest: () => tick({ triggeredBy: 'cron' }),

  digest: () => runDigest(),

  clean: async () => ({
    items: await pruneItems(appConfig.ingest.retentionDays),
    jobs: await pruneJobs(appConfig.ingest.retentionDays),
    runs: await pruneRuns(30),
    sessions: await pruneExpiredSessions(),
  }),

  /**
   * Collection followed by housekeeping, in one invocation.
   *
   * Vercel's Hobby plan allows two cron jobs per account, and this project needs
   * three things to happen daily. Pairing the two cheap ones keeps every job
   * individually callable (useful for a manual run) while fitting the limit.
   */
  daily: async () => ({
    ingest: await JOBS.ingest(),
    clean: await JOBS.clean(),
  }),
};

export default async function handler(request, response) {
  if (!authorised(request)) {
    // Deliberately vague: a caller without the secret learns nothing about
    // whether the job name was even valid.
    return response.status(401).json({ error: 'Unauthorized' });
  }

  const name = String(request.query.job ?? '');
  if (!Object.hasOwn(JOBS, name)) return response.status(404).json({ error: `Unknown cron job '${name}'` });

  const started = Date.now();
  try {
    const result = await JOBS[name]();
    log.info(`${name} finished in ${Date.now() - started}ms`);
    return response.json({ job: name, ok: true, durationMs: Date.now() - started, result });
  } catch (error) {
    log.error(`${name} failed: ${error.message}`);
    return response.status(500).json({ job: name, ok: false, error: error.message });
  }
}
