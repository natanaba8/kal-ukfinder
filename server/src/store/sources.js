import crypto from 'node:crypto';

import { bind, db, fromJson, nowIso, toJson } from '../db.js';

/**
 * The source registry that replaces the hardcoded feed list.
 *
 * `trust` doubles as the news/policy distinction the app already uses:
 * `official` sources produce items with kind 'policy' (GOV.UK, ONS, regulators),
 * everything else produces 'news'. That keeps the Policy tab meaning what it
 * always meant while fitting pr.md's JOB | POLICY | BOTH content model.
 */

export const CONTENT_TYPES = ['JOB', 'POLICY', 'BOTH'];
export const METHODS = ['AUTO', 'RSS', 'API', 'SCRAPER'];
export const MODERATION_MODES = ['AUTO_PUBLISH', 'REQUIRE_APPROVAL'];
export const TRUST_LEVELS = ['official', 'trusted', 'community'];

export const SELECTOR_FIELDS = [
  'item',
  'title',
  'url',
  'description',
  'image',
  'date',
  'organization',
  'location',
  'deadline',
  'salary',
  'category',
];

const rowToSource = (row) => ({
  id: row.id,
  name: row.name,
  publisher: row.publisher || '',
  baseUrl: row.base_url,
  contentType: row.content_type,
  method: row.method,
  resolvedMethod: row.resolved_method || null,
  rssUrl: row.rss_url || null,
  apiUrl: row.api_url || null,
  apiProvider: row.api_provider || null,
  scrapeUrl: row.scrape_url || null,
  selectors: fromJson(row.selectors, {}),
  requestHeaders: fromJson(row.request_headers, {}),
  trust: row.trust,
  /** Derived, not stored — see the note at the top of this file. */
  itemKind: row.trust === 'official' ? 'policy' : 'news',
  defaultTopics: fromJson(row.default_topics, []),
  defaultAudience: fromJson(row.default_audience, []),
  active: row.active === 1,
  moderation: row.moderation,
  scrapeIntervalMinutes: row.scrape_interval_minutes,
  maxItemsPerRun: row.max_items_per_run,
  lastSyncAt: row.last_sync_at || null,
  lastStatus: row.last_status || 'never',
  lastError: row.last_error || null,
  consecutiveFailures: row.consecutive_failures,
  createdBy: row.created_by || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export { rowToSource };

/** The URL the engine actually fetches, given the resolved method. */
export const endpointFor = (source) => {
  const method = source.resolvedMethod ?? source.method;
  if (method === 'RSS') return source.rssUrl ?? source.baseUrl;
  if (method === 'API') return source.apiUrl ?? source.baseUrl;
  if (method === 'SCRAPER') return source.scrapeUrl ?? source.baseUrl;
  return source.rssUrl ?? source.apiUrl ?? source.scrapeUrl ?? source.baseUrl;
};

export const getSource = (id) => {
  const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
  return row ? rowToSource(row) : null;
};

export const listSources = ({ search, contentType, method, active, status, page = 1, pageSize = 50 } = {}) => {
  const where = [];
  const params = [];

  if (search) {
    where.push('(name LIKE ? OR base_url LIKE ? OR publisher LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (contentType) {
    where.push('content_type = ?');
    params.push(contentType);
  }
  if (method) {
    where.push('(method = ? OR resolved_method = ?)');
    params.push(method, method);
  }
  if (active !== undefined) {
    where.push('active = ?');
    params.push(active ? 1 : 0);
  }
  if (status) {
    where.push('last_status = ?');
    params.push(status);
  }

  const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS total FROM sources${clause}`).get(...params).total;
  const limit = Math.min(200, Math.max(1, pageSize));

  const rows = db
    .prepare(`SELECT * FROM sources${clause} ORDER BY active DESC, name COLLATE NOCASE LIMIT ? OFFSET ?`)
    .all(...params, limit, (Math.max(1, page) - 1) * limit);

  return { data: rows.map(rowToSource), total, page: Math.max(1, page), pageSize: limit };
};

/** Every active source, used by the scheduler and the ingest CLI. */
export const activeSources = () =>
  db.prepare('SELECT * FROM sources WHERE active = 1 ORDER BY name').all().map(rowToSource);

/**
 * Sources whose next run is due.
 *
 * A source that keeps failing backs off exponentially — 1x, 2x, 4x … up to 24x
 * its interval — so a dead site is retried occasionally rather than every tick.
 */
export const dueSources = (now = Date.now()) =>
  activeSources().filter((source) => {
    if (!source.lastSyncAt) return true;

    const backoff = Math.min(24, 2 ** Math.max(0, source.consecutiveFailures - 1));
    const waitMs = source.scrapeIntervalMinutes * 60_000 * (source.consecutiveFailures > 0 ? backoff : 1);
    return new Date(source.lastSyncAt).getTime() + waitMs <= now;
  });

const slugify = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'source';

const uniqueId = (name) => {
  const base = slugify(name);
  if (!db.prepare('SELECT 1 FROM sources WHERE id = ?').get(base)) return base;
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
};

export const createSource = (input, createdBy = null) => {
  const id = input.id ?? uniqueId(input.name);
  const timestamp = nowIso();

  db.prepare(`
    INSERT INTO sources (
      id, name, publisher, base_url, content_type, method, resolved_method, rss_url, api_url,
      api_provider, scrape_url, selectors, request_headers, trust, default_topics, default_audience,
      active, moderation, scrape_interval_minutes, max_items_per_run, last_status, created_by,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'never', ?, ?, ?)
  `).run(
    id,
    bind(input.name),
    bind(input.publisher ?? ''),
    bind(input.baseUrl),
    bind(input.contentType ?? 'POLICY'),
    bind(input.method ?? 'AUTO'),
    bind(input.resolvedMethod),
    bind(input.rssUrl),
    bind(input.apiUrl),
    bind(input.apiProvider),
    bind(input.scrapeUrl),
    toJson(input.selectors ?? {}),
    toJson(input.requestHeaders ?? {}),
    bind(input.trust ?? 'trusted'),
    toJson(input.defaultTopics ?? []),
    toJson(input.defaultAudience ?? []),
    bind(input.active === undefined ? 1 : input.active ? 1 : 0),
    bind(input.moderation ?? 'AUTO_PUBLISH'),
    bind(input.scrapeIntervalMinutes ?? 30),
    bind(input.maxItemsPerRun ?? 15),
    bind(createdBy),
    timestamp,
    timestamp,
  );

  return getSource(id);
};

const COLUMN_FOR = {
  name: 'name',
  publisher: 'publisher',
  baseUrl: 'base_url',
  contentType: 'content_type',
  method: 'method',
  resolvedMethod: 'resolved_method',
  rssUrl: 'rss_url',
  apiUrl: 'api_url',
  apiProvider: 'api_provider',
  scrapeUrl: 'scrape_url',
  trust: 'trust',
  active: 'active',
  moderation: 'moderation',
  scrapeIntervalMinutes: 'scrape_interval_minutes',
  maxItemsPerRun: 'max_items_per_run',
};

const JSON_COLUMN_FOR = {
  selectors: 'selectors',
  requestHeaders: 'request_headers',
  defaultTopics: 'default_topics',
  defaultAudience: 'default_audience',
};

export const updateSource = (id, patch) => {
  if (!getSource(id)) return null;

  const assignments = [];
  const params = [];

  for (const [key, column] of Object.entries(COLUMN_FOR)) {
    if (patch[key] === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(bind(key === 'active' ? (patch[key] ? 1 : 0) : patch[key]));
  }

  for (const [key, column] of Object.entries(JSON_COLUMN_FOR)) {
    if (patch[key] === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(toJson(patch[key]));
  }

  if (assignments.length === 0) return getSource(id);

  assignments.push('updated_at = ?');
  params.push(nowIso(), id);

  db.prepare(`UPDATE sources SET ${assignments.join(', ')} WHERE id = ?`).run(...params);
  return getSource(id);
};

export const deleteSource = (id) => db.prepare('DELETE FROM sources WHERE id = ?').run(id).changes;

/** Called by the engine after every run so the table shows live health. */
export const recordSyncResult = (id, { status, error = null }) => {
  const failed = status === 'failed';

  db.prepare(`
    UPDATE sources
       SET last_sync_at = ?, last_status = ?, last_error = ?,
           consecutive_failures = CASE WHEN ? THEN consecutive_failures + 1 ELSE 0 END,
           updated_at = ?
     WHERE id = ?
  `).run(nowIso(), status, bind(error), failed ? 1 : 0, nowIso(), id);
};

export const sourceCounts = () => {
  const row = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN last_status = 'failed' THEN 1 ELSE 0 END) AS failing,
        SUM(CASE WHEN last_status = 'never' THEN 1 ELSE 0 END) AS never_run
      FROM sources
    `)
    .get();

  return {
    total: row.total ?? 0,
    active: row.active ?? 0,
    failing: row.failing ?? 0,
    neverRun: row.never_run ?? 0,
  };
};
