import { db } from './db.js';
import { collectAll } from './scheduler/index.js';
import { isAiEnabled } from './ai/gemini.js';
import { jobProvidersConfigured } from './sources/jobs.js';
import { sourceCounts } from './store/sources.js';

/**
 * Compatibility wrapper over the content engine.
 *
 * Collection now lives in `content/engine.js` and is scheduled per source, but
 * the CLI (`npm run ingest`), the tests and `/api/admin/ingest` still call
 * `runIngest()`, so it stays as the "collect everything now" entry point.
 */
export const runIngest = async ({ triggeredBy = 'cli' } = {}) => {
  const { sources, results } = await collectAll({ triggeredBy });

  const stats = results.reduce(
    (accumulator, result) => ({
      ...accumulator,
      fetched: accumulator.fetched + result.itemsFound,
      inserted: accumulator.inserted + result.itemsNew,
      updated: accumulator.updated + result.itemsUpdated,
      duplicates: accumulator.duplicates + result.itemsDuplicate,
      failedSources:
        result.status === 'failed' ? [...accumulator.failedSources, result.sourceId] : accumulator.failedSources,
    }),
    { fetched: 0, inserted: 0, updated: 0, duplicates: 0, failedSources: [] },
  );

  return {
    sources,
    ...stats,
    fresh: stats.inserted,
    jobProviders: jobProvidersConfigured(),
    aiEnabled: isAiEnabled(),
  };
};

export const lastIngestRun = () => {
  const row = db
    .prepare(`
      SELECT r.*, s.name AS source_name
        FROM scrape_runs r LEFT JOIN sources s ON s.id = r.source_id
       ORDER BY r.started_at DESC LIMIT 1
    `)
    .get();

  if (!row) return null;

  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    stats: {
      itemsFound: row.items_found,
      itemsNew: row.items_new,
      itemsUpdated: row.items_updated,
      itemsDuplicate: row.items_duplicate,
      errorCount: row.error_count,
    },
  };
};

export { isRunning as isIngestRunning } from './scheduler/index.js';

export const ingestOverview = () => sourceCounts();
