import crypto from 'node:crypto';

import { bind, db, nowIso } from '../db.js';

/** Run history and error detail behind the admin panel's log views (pr.md §33). */

const rowToRun = (row) => ({
  id: row.id,
  sourceId: row.source_id,
  sourceName: row.source_name ?? null,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  status: row.status,
  method: row.method,
  itemsFound: row.items_found,
  itemsNew: row.items_new,
  itemsUpdated: row.items_updated,
  itemsDuplicate: row.items_duplicate,
  errorCount: row.error_count,
  durationMs: row.duration_ms,
  triggeredBy: row.triggered_by,
});

export const startRun = async ({ sourceId, method, triggeredBy = 'scheduler' }) => {
  const id = crypto.randomUUID();
  (await db.run(`
    INSERT INTO scrape_runs (id, source_id, started_at, status, method, triggered_by)
    VALUES (?, ?, ?, 'running', ?, ?)
  `, [id, bind(sourceId), nowIso(), bind(method), triggeredBy]));
  return id;
};

export const finishRun = async (id, { status, itemsFound = 0, itemsNew = 0, itemsUpdated = 0, itemsDuplicate = 0, errorCount = 0, method, startedAtMs }) => {
  (await db.run(`
    UPDATE scrape_runs
       SET finished_at = ?, status = ?, items_found = ?, items_new = ?, items_updated = ?,
           items_duplicate = ?, error_count = ?, duration_ms = ?, method = COALESCE(?, method)
     WHERE id = ?
  `, [nowIso(),
    status,
    itemsFound,
    itemsNew,
    itemsUpdated,
    itemsDuplicate,
    errorCount,
    startedAtMs ? Date.now() - startedAtMs : null,
    bind(method),
    id,]));
};

export const logError = async ({ runId, sourceId, stage, message, detail = null }) => {
  (await db.run(`
    INSERT INTO scrape_errors (id, run_id, source_id, stage, message, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [crypto.randomUUID(), bind(runId), bind(sourceId), stage, String(message).slice(0, 500), bind(detail), nowIso()]));
};

export const listRuns = async ({ sourceId, status, page = 1, pageSize = 25 } = {}) => {
  const where = [];
  const params = [];

  if (sourceId) {
    where.push('r.source_id = ?');
    params.push(sourceId);
  }
  if (status) {
    where.push('r.status = ?');
    params.push(status);
  }

  const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  const total = (await db.get(`SELECT COUNT(*) AS total FROM scrape_runs r${clause}`, [...params])).total;
  const limit = Math.min(100, Math.max(1, pageSize));

  const rows = (await db.all(`
      SELECT r.*, s.name AS source_name
        FROM scrape_runs r
        LEFT JOIN sources s ON s.id = r.source_id
        ${clause}
       ORDER BY r.started_at DESC
       LIMIT ? OFFSET ?
    `, [...params, limit, (Math.max(1, page) - 1) * limit]));

  return { data: rows.map(rowToRun), total, page: Math.max(1, page), pageSize: limit };
};

export const runErrors = async (runId) =>
  (await db.all('SELECT * FROM scrape_errors WHERE run_id = ? ORDER BY created_at', [runId]))
    .map((row) => ({
      id: row.id,
      stage: row.stage,
      message: row.message,
      detail: row.detail,
      createdAt: row.created_at,
    }));

export const lastRunFor = async (sourceId) => {
  const row = (await db.get('SELECT r.*, s.name AS source_name FROM scrape_runs r LEFT JOIN sources s ON s.id = r.source_id WHERE r.source_id = ? ORDER BY r.started_at DESC LIMIT 1', [sourceId]));
  return row ? rowToRun(row) : null;
};

export const runSummary = async () => {
  const lastSuccess = (await db.get("SELECT started_at FROM scrape_runs WHERE status = 'success' ORDER BY started_at DESC LIMIT 1", []));
  const lastFailure = (await db.get("SELECT started_at, source_id FROM scrape_runs WHERE status = 'failed' ORDER BY started_at DESC LIMIT 1", []));

  const today = new Date(Date.now() - 86_400_000).toISOString();
  const todayTotals = (await db.get(`
      SELECT COALESCE(SUM(items_new), 0) AS new_items,
             COALESCE(SUM(items_duplicate), 0) AS duplicates,
             COUNT(*) AS runs
        FROM scrape_runs WHERE started_at >= ?
    `, [today]));

  return {
    lastSuccessAt: lastSuccess?.started_at ?? null,
    lastFailureAt: lastFailure?.started_at ?? null,
    lastFailureSourceId: lastFailure?.source_id ?? null,
    runsToday: todayTotals.runs,
    newItemsToday: todayTotals.new_items,
    duplicatesToday: todayTotals.duplicates,
  };
};

export const pruneRuns = async (days) => {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return (await db.run('DELETE FROM scrape_runs WHERE started_at < ?', [cutoff])).changes;
};
