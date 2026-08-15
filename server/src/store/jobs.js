import crypto from 'node:crypto';

import { bind, db, fromJson, nowIso, toJson } from '../db.js';

export const idForJobUrl = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 20);

const rowToJob = (row) => ({
  id: row.id,
  source: row.source,
  title: row.title,
  company: row.company || 'Employer not stated',
  location: row.location || 'United Kingdom',
  region: row.region || 'UK wide',
  remote: row.remote === 1,
  salaryMin: row.salary_min,
  salaryMax: row.salary_max,
  salaryText: row.salary_text || 'Salary not stated',
  contractType: row.contract_type,
  category: row.category,
  url: row.url,
  description: row.description || '',
  postedAt: row.posted_at,
  summary: row.ai_summary || '',
  skills: fromJson(row.ai_skills, []),
  isSample: row.source === 'sample',
  employmentType: row.employment_type || row.contract_type || null,
  requirements: row.requirements || null,
  deadline: row.deadline || null,
  sourceUrl: row.source_url || null,
  sourceId: row.db_source_id || null,
  status: row.status || 'published',
  featured: row.featured === 1,
});

export { rowToJob };

const upsertStatement = db.prepare(`
  INSERT INTO jobs (
    id, source, external_id, title, company, location, region, remote, salary_min, salary_max,
    salary_text, contract_type, category, url, description, posted_at, ai_summary, ai_skills, created_at,
    db_source_id, employment_type, requirements, deadline, source_url, content_hash, status, featured, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (url) DO UPDATE SET
    title = excluded.title,
    company = excluded.company,
    location = excluded.location,
    salary_min = excluded.salary_min,
    salary_max = excluded.salary_max,
    salary_text = excluded.salary_text,
    description = excluded.description,
    requirements = excluded.requirements,
    deadline = excluded.deadline,
    employment_type = excluded.employment_type,
    posted_at = excluded.posted_at,
    updated_at = excluded.updated_at
`);

export const upsertJob = (job) => {
  const id = job.id ?? idForJobUrl(job.url);
  upsertStatement.run(
    bind(id),
    bind(job.source),
    bind(job.externalId),
    bind(job.title),
    bind(job.company),
    bind(job.location),
    bind(job.region),
    bind(job.remote ? 1 : 0),
    bind(job.salaryMin),
    bind(job.salaryMax),
    bind(job.salaryText),
    bind(job.contractType),
    bind(job.category),
    bind(job.url),
    bind(job.description),
    bind(job.postedAt),
    bind(job.summary),
    toJson(job.skills ?? []),
    nowIso(),
    bind(job.dbSourceId),
    bind(job.employmentType ?? job.contractType),
    bind(job.requirements),
    bind(job.deadline),
    bind(job.sourceUrl),
    bind(job.contentHash),
    bind(job.status ?? 'published'),
    bind(job.featured ? 1 : 0),
    nowIso(),
  );
  return id;
};

/** Shared by the list, count and paginated queries (pr.md §25). */
const buildJobFilters = ({
  search,
  location,
  remoteOnly,
  salaryMin,
  category,
  contractType,
  employmentType,
  organization,
  sourceId,
  featured,
  openOnly,
  status = 'published',
} = {}) => {
  const where = [];
  const params = [];

  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(title LIKE ? OR company LIKE ? OR description LIKE ? OR category LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (location) {
    where.push('(location LIKE ? OR region LIKE ?)');
    params.push(`%${location}%`, `%${location}%`);
  }
  if (remoteOnly) where.push('remote = 1');
  if (salaryMin) {
    where.push('(COALESCE(salary_max, salary_min, 0) >= ?)');
    params.push(salaryMin);
  }
  if (category) {
    where.push('category LIKE ?');
    params.push(`%${category}%`);
  }
  if (contractType) {
    where.push('contract_type = ?');
    params.push(contractType);
  }
  if (employmentType) {
    where.push('COALESCE(employment_type, contract_type) = ?');
    params.push(employmentType);
  }
  if (organization) {
    where.push('company LIKE ?');
    params.push(`%${organization}%`);
  }
  if (sourceId) {
    where.push('db_source_id = ?');
    params.push(sourceId);
  }
  if (featured !== undefined) {
    where.push('featured = ?');
    params.push(featured ? 1 : 0);
  }
  // Hide vacancies whose closing date has passed.
  if (openOnly) {
    where.push('(deadline IS NULL OR deadline >= ?)');
    params.push(new Date().toISOString());
  }

  return { clause: where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '', params };
};

export const listJobs = ({ limit = 30, offset = 0, ...filters } = {}) => {
  const { clause, params } = buildJobFilters(filters);

  return db
    .prepare(`SELECT * FROM jobs${clause} ORDER BY featured DESC, posted_at DESC LIMIT ? OFFSET ?`)
    .all(...params, Math.min(100, limit), offset)
    .map(rowToJob);
};

/** Paginated form returned by /api/jobs (pr.md §25, §36). */
export const listJobsPaged = ({ page = 1, pageSize = 20, ...filters } = {}) => {
  const { clause, params } = buildJobFilters(filters);
  const total = db.prepare(`SELECT COUNT(*) AS total FROM jobs${clause}`).get(...params).total;
  const limit = Math.min(100, Math.max(1, pageSize));
  const currentPage = Math.max(1, page);

  const data = db
    .prepare(`SELECT * FROM jobs${clause} ORDER BY featured DESC, posted_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (currentPage - 1) * limit)
    .map(rowToJob);

  return { data, total, page: currentPage, pageSize: limit, pages: Math.ceil(total / limit) };
};

export const getJob = (id) => {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  return row ? rowToJob(row) : null;
};

export const getJobsByIds = (ids) => {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM jobs WHERE id IN (${placeholders})`).all(...ids).map(rowToJob);
};

export const countJobs = () => db.prepare('SELECT COUNT(*) AS total FROM jobs').get().total;

export const jobCategories = () =>
  db
    .prepare('SELECT category, COUNT(*) AS total FROM jobs WHERE category IS NOT NULL GROUP BY category ORDER BY total DESC')
    .all()
    .map((row) => ({ category: row.category, total: row.total }));

export const pruneJobs = (days) => {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return db.prepare('DELETE FROM jobs WHERE posted_at < ?').run(cutoff).changes;
};

/** Admin moderation (pr.md §26, §34). */
export const setJobStatus = (id, status) =>
  db.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id).changes;

export const setJobFeatured = (id, featured) =>
  db.prepare('UPDATE jobs SET featured = ?, updated_at = ? WHERE id = ?').run(featured ? 1 : 0, nowIso(), id)
    .changes;

export const deleteJob = (id) => db.prepare('DELETE FROM jobs WHERE id = ?').run(id).changes;

export const updateJobMeta = (id, { category, employmentType, location, deadline }) => {
  const assignments = [];
  const params = [];

  for (const [key, column, value] of [
    ['category', 'category', category],
    ['employmentType', 'employment_type', employmentType],
    ['location', 'location', location],
    ['deadline', 'deadline', deadline],
  ]) {
    if (value === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(bind(value));
  }

  if (assignments.length === 0) return getJob(id);

  assignments.push('updated_at = ?');
  params.push(nowIso(), id);

  db.prepare(`UPDATE jobs SET ${assignments.join(', ')} WHERE id = ?`).run(...params);
  return getJob(id);
};

export const jobCounts = () => {
  const row = db
    .prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
             SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) AS hidden,
             SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS today
        FROM jobs
    `)
    .get(new Date(Date.now() - 86_400_000).toISOString());

  return {
    total: row.total ?? 0,
    published: row.published ?? 0,
    pending: row.pending ?? 0,
    hidden: row.hidden ?? 0,
    today: row.today ?? 0,
  };
};

export const jobLocations = () =>
  db
    .prepare("SELECT location, COUNT(*) AS total FROM jobs WHERE location IS NOT NULL AND location != '' GROUP BY location ORDER BY total DESC LIMIT 40")
    .all()
    .map((row) => ({ location: row.location, total: row.total }));

export const jobOrganizations = () =>
  db
    .prepare("SELECT company, COUNT(*) AS total FROM jobs WHERE company IS NOT NULL AND company != '' GROUP BY company ORDER BY total DESC LIMIT 40")
    .all()
    .map((row) => ({ organization: row.company, total: row.total }));
