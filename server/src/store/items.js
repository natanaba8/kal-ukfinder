import crypto from 'node:crypto';

import { bind, db, fromJson, nowIso, toJson } from '../db.js';

export const idForUrl = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 20);

const SELECT = `SELECT * FROM items`;

const rowToItem = (row) => ({
  id: row.id,
  kind: row.kind,
  source: { id: row.source_id, name: row.source_name, trust: row.source_trust },
  title: row.title,
  headline: row.ai_headline || row.title,
  url: row.url,
  author: row.author || null,
  publishedAt: row.published_at,
  imageUrl: row.image_url || null,
  summary: fromJson(row.ai_summary, []),
  rawSummary: row.raw_summary || '',
  impact: row.ai_impact || '',
  action: row.ai_action || '',
  topics: fromJson(row.topics, []),
  audience: fromJson(row.audience, []),
  region: row.region,
  importance: row.importance,
  readingMinutes: row.reading_minutes,
  aiModel: row.ai_model || 'rule-based',
  category: row.category || null,
  sourceUrl: row.source_url || null,
  status: row.status || 'published',
  featured: row.featured === 1,
});

export { rowToItem };

const INSERT_ITEM = `
  INSERT INTO items (
    id, kind, source_id, source_name, source_trust, title, url, author, published_at, image_url,
    raw_summary, ai_headline, ai_summary, ai_impact, ai_action, topics, audience, region,
    importance, reading_minutes, ai_model, created_at,
    db_source_id, category, source_url, content_hash, status, featured, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (url) DO NOTHING
`;

export const insertItem = async (item) =>
  await db.run(INSERT_ITEM, [
    bind(item.id),
    bind(item.kind),
    bind(item.sourceId),
    bind(item.sourceName),
    bind(item.sourceTrust ?? 'trusted'),
    bind(item.title),
    bind(item.url),
    bind(item.author),
    bind(item.publishedAt),
    bind(item.imageUrl),
    bind(item.rawSummary),
    bind(item.headline),
    toJson(item.bullets ?? []),
    bind(item.impact),
    bind(item.action),
    toJson(item.topics ?? []),
    toJson(item.audience ?? []),
    bind(item.region ?? 'UK'),
    bind(item.importance ?? 3),
    bind(item.readingMinutes ?? 1),
    bind(item.aiModel),
    nowIso(),
    bind(item.dbSourceId ?? item.sourceId),
    bind(item.category),
    bind(item.sourceUrl),
    bind(item.contentHash),
    bind(item.status ?? 'published'),
    bind(item.featured ? 1 : 0),
    nowIso(),
  ]);

export const knownUrls = async (urls) => {
  if (urls.length === 0) return new Set();
  const placeholders = urls.map(() => '?').join(',');
  const rows = (await db.all(`SELECT url FROM items WHERE url IN (${placeholders})`, [...urls]));
  return new Set(rows.map((row) => row.url));
};

/**
 * Builds the WHERE clause shared by the list and count queries.
 *
 * `status` defaults to 'published' so hidden and pending items never reach the
 * app; the admin routes pass `status: null` to see everything (pr.md §26, §34).
 */
const buildFilters = ({
  kind,
  topics = [],
  audience = [],
  search,
  category,
  sourceId,
  featured,
  status = 'published',
} = {}) => {
  const where = [];
  const params = [];

  if (kind) {
    where.push('kind = ?');
    params.push(kind);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  for (const topic of topics) {
    where.push('topics LIKE ?');
    params.push(`%"${topic}"%`);
  }
  for (const entry of audience) {
    where.push('audience LIKE ?');
    params.push(`%"${entry}"%`);
  }
  if (search) {
    where.push('(title LIKE ? OR raw_summary LIKE ? OR ai_headline LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category) {
    where.push('category = ?');
    params.push(category);
  }
  if (sourceId) {
    where.push('db_source_id = ?');
    params.push(sourceId);
  }
  if (featured !== undefined) {
    where.push('featured = ?');
    params.push(featured ? 1 : 0);
  }

  return { clause: where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '', params };
};

/**
 * @param {object} filters see `buildFilters`
 * @param {number} [filters.limit]
 * @param {number} [filters.offset]
 */
export const listItems = async ({ limit = 30, offset = 0, ...filters } = {}) => {
  const { clause, params } = buildFilters(filters);

  return (await db.all(`${SELECT}${clause} ORDER BY featured DESC, published_at DESC LIMIT ? OFFSET ?`, [...params, Math.min(100, limit), offset]))
    .map(rowToItem);
};

/** Paginated form used by the public API and the admin tables (pr.md §25, §36). */
export const listItemsPaged = async ({ page = 1, pageSize = 20, ...filters } = {}) => {
  const { clause, params } = buildFilters(filters);
  const total = (await db.get(`SELECT COUNT(*) AS total FROM items${clause}`, [...params])).total;
  const limit = Math.min(100, Math.max(1, pageSize));
  const currentPage = Math.max(1, page);

  const data = (await db.all(`${SELECT}${clause} ORDER BY featured DESC, published_at DESC LIMIT ? OFFSET ?`, [...params, limit, (currentPage - 1) * limit]))
    .map(rowToItem);

  return { data, total, page: currentPage, pageSize: limit, pages: Math.ceil(total / limit) };
};

export const getItem = async (id) => {
  const row = (await db.get(`${SELECT} WHERE id = ?`, [id]));
  return row ? rowToItem(row) : null;
};

export const countItems = async () => (await db.get('SELECT COUNT(*) AS total FROM items', [])).total;

/** Admin moderation actions (pr.md §26, §34). */
export const setItemStatus = async (id, status) =>
  (await db.run('UPDATE items SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id])).changes;

export const setItemFeatured = async (id, featured) =>
  (await db.run('UPDATE items SET featured = ?, updated_at = ? WHERE id = ?', [featured ? 1 : 0, nowIso(), id]))
    .changes;

export const deleteItem = async (id) => (await db.run('DELETE FROM items WHERE id = ?', [id])).changes;

/** Metadata only — the source's own words are never rewritten (pr.md §26). */
export const updateItemMeta = async (id, { category, topics, audience, importance }) => {
  const assignments = [];
  const params = [];

  if (category !== undefined) {
    assignments.push('category = ?');
    params.push(bind(category));
  }
  if (topics !== undefined) {
    assignments.push('topics = ?');
    params.push(toJson(topics));
  }
  if (audience !== undefined) {
    assignments.push('audience = ?');
    params.push(toJson(audience));
  }
  if (importance !== undefined) {
    assignments.push('importance = ?');
    params.push(Math.min(5, Math.max(1, Number(importance) || 3)));
  }
  if (assignments.length === 0) return await getItem(id);

  assignments.push('updated_at = ?');
  params.push(nowIso(), id);

  (await db.run(`UPDATE items SET ${assignments.join(', ')} WHERE id = ?`, [...params]));
  return await getItem(id);
};

export const itemCounts = async () => {
  const row = (await db.get(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
             SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) AS hidden,
             SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS today
        FROM items
    `, [new Date(Date.now() - 86_400_000).toISOString()]));

  return {
    total: row.total ?? 0,
    published: row.published ?? 0,
    pending: row.pending ?? 0,
    hidden: row.hidden ?? 0,
    today: row.today ?? 0,
  };
};

export const distinctCategories = async () =>
  (await db.all("SELECT category, COUNT(*) AS total FROM items WHERE category IS NOT NULL AND category != '' GROUP BY category ORDER BY total DESC LIMIT 60", []))
    .map((row) => ({ category: row.category, total: row.total }));

export const latestPublishedAt = async () =>
  (await db.get('SELECT MAX(published_at) AS latest FROM items', [])).latest ?? null;

export const pruneItems = async (days) => {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return (await db.run('DELETE FROM items WHERE published_at < ?', [cutoff])).changes;
};

/**
 * Personalised ranking: recency, editorial importance, and overlap with the
 * topics/audiences the user picked in onboarding.
 */
export const rankedForProfile = async (profile = {}, { limit = 40, kind } = {}) => {
  // 100 is the ceiling listItems enforces — the most recent window we rank over.
  const pool = await listItems({ kind, limit: 100 });
  const topics = new Set(profile.topics ?? []);
  const audiences = new Set(profile.audience ?? []);
  const now = Date.now();

  return pool
    .map((item) => {
      const ageHours = Math.max(0, (now - new Date(item.publishedAt).getTime()) / 3_600_000);
      const topicHits = item.topics.filter((topic) => topics.has(topic)).length;
      const audienceHits = item.audience.filter((entry) => audiences.has(entry)).length;

      const score =
        topicHits * 30 +
        audienceHits * 18 +
        item.importance * 8 +
        Math.max(0, 40 - ageHours) + // strong boost inside the last ~40 hours
        (item.kind === 'policy' ? 6 : 0);

      return { ...item, score: Math.round(score), matchedTopics: item.topics.filter((topic) => topics.has(topic)) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};
