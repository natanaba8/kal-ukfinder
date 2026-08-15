import crypto from 'node:crypto';

import { stripHtml } from '../sources/rss.js';

/**
 * Adapter output → the common Job and Policy models (pr.md §14, §15).
 *
 * Deliberately lossy on article bodies: we keep a title, a short excerpt, the
 * source and a link, never the full text of someone else's copyrighted article
 * (§15, §40).
 */

const EXCERPT_LIMIT = 1200;

const REMOTE_PATTERN = /\b(remote|work from home|wfh|home[- ]based|hybrid)\b/i;

const EMPLOYMENT_TYPES = [
  [/\b(full[- ]time|permanent|full time)\b/i, 'full_time'],
  [/\b(part[- ]time|part time)\b/i, 'part_time'],
  [/\bapprentice(ship)?\b/i, 'apprenticeship'],
  [/\b(graduate|trainee) (scheme|programme|role)\b/i, 'graduate'],
  [/\b(contract|fixed[- ]term|interim|temporary|temp)\b/i, 'contract'],
  [/\b(internship|placement)\b/i, 'internship'],
  [/\bterm[- ]time\b/i, 'term_time'],
  [/\b(volunteer|voluntary)\b/i, 'volunteer'],
];

const detectEmploymentType = (text) => {
  for (const [pattern, type] of EMPLOYMENT_TYPES) {
    if (pattern.test(text)) return type;
  }
  return null;
};

const SALARY_PATTERN = /£\s?([\d,]+(?:\.\d+)?)(?:\s?(?:k|K))?(?:\s?(?:-|–|to)\s?£?\s?([\d,]+(?:\.\d+)?)(?:\s?(?:k|K))?)?/;

/** "£28,000 - £34,000" or "£30k" → numeric bounds where they can be read. */
export const parseSalary = (text) => {
  if (!text) return { min: null, max: null };

  const match = SALARY_PATTERN.exec(text);
  if (!match) return { min: null, max: null };

  const toNumber = (value, raw) => {
    if (!value) return null;
    const numeric = Number.parseFloat(value.replace(/,/g, ''));
    if (!Number.isFinite(numeric)) return null;
    // "30k" and bare small numbers that are obviously thousands.
    return /k/i.test(raw) && numeric < 1000 ? numeric * 1000 : numeric;
  };

  const min = toNumber(match[1], match[0]);
  const max = toNumber(match[2], match[0]);
  return { min, max: max ?? null };
};

const toIso = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

/**
 * Stable identity for duplicate detection: the normalised title plus the
 * organisation, so the same vacancy syndicated to three boards hashes the same.
 */
export const contentHash = ({ title, organization }) => {
  const normalised = `${normaliseTitle(title)}|${normaliseTitle(organization ?? '')}`;
  return crypto.createHash('sha1').update(normalised).digest('hex').slice(0, 20);
};

export const normaliseTitle = (title) =>
  String(title ?? '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9&\s]/g, ' ')
    .replace(/\b(job|vacancy|vacancies|role|position|apply now|new)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const excerpt = (text) => {
  const clean = stripHtml(text ?? '');
  if (clean.length <= EXCERPT_LIMIT) return clean;
  const cut = clean.slice(0, EXCERPT_LIMIT);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return `${cut.slice(0, lastStop > EXCERPT_LIMIT * 0.5 ? lastStop + 1 : EXCERPT_LIMIT).trim()}…`;
};

/** @returns {object} a row ready for `store/jobs.js` */
export const normaliseJob = (raw, source) => {
  const description = excerpt(raw.summary ?? raw.description ?? '');
  const haystack = `${raw.title} ${description} ${raw.employmentType ?? ''}`;
  const salary = raw.salaryMin || raw.salaryMax ? { min: raw.salaryMin, max: raw.salaryMax } : parseSalary(raw.salaryText ?? haystack);

  return {
    source: source.apiProvider ?? source.id,
    dbSourceId: source.id,
    externalId: raw.externalId ?? null,
    title: stripHtml(raw.title).slice(0, 300),
    company: raw.organization ? stripHtml(raw.organization).slice(0, 200) : '',
    location: raw.location ? stripHtml(raw.location).slice(0, 200) : 'United Kingdom',
    region: raw.region ?? null,
    remote: raw.remote ?? REMOTE_PATTERN.test(haystack),
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryText: raw.salaryText ?? (salary.min ? `£${Math.round(salary.min).toLocaleString('en-GB')}${salary.max ? ` – £${Math.round(salary.max).toLocaleString('en-GB')}` : ''}` : null),
    contractType: raw.employmentType ?? detectEmploymentType(haystack),
    employmentType: raw.employmentType ?? detectEmploymentType(haystack),
    category: raw.categories?.[0] ?? null,
    url: raw.url,
    sourceUrl: source.baseUrl,
    description,
    requirements: raw.requirements ? excerpt(raw.requirements) : null,
    deadline: toIso(raw.deadline),
    postedAt: toIso(raw.publishedAt) ?? new Date().toISOString(),
    contentHash: contentHash({ title: raw.title, organization: raw.organization }),
    status: source.moderation === 'REQUIRE_APPROVAL' ? 'pending' : 'published',
  };
};

/** @returns {object} a row ready for `store/items.js` (before AI enrichment) */
export const normalisePolicy = (raw, source) => ({
  kind: source.itemKind,
  sourceId: source.id,
  dbSourceId: source.id,
  sourceName: source.name,
  sourceTrust: source.trust,
  title: stripHtml(raw.title).slice(0, 400),
  url: raw.url,
  sourceUrl: source.baseUrl,
  author: raw.author ? stripHtml(raw.author).slice(0, 200) : null,
  publishedAt: toIso(raw.publishedAt) ?? new Date().toISOString(),
  imageUrl: raw.imageUrl ?? null,
  rawSummary: excerpt(raw.summary),
  category: raw.categories?.[0] ?? null,
  contentHash: contentHash({ title: raw.title, organization: source.name }),
  status: source.moderation === 'REQUIRE_APPROVAL' ? 'pending' : 'published',
  hints: source.defaultTopics,
  audienceHints: source.defaultAudience,
});

/** A source set to BOTH decides per item; a job needs an employer or a salary. */
export const looksLikeJob = (raw) =>
  Boolean(raw.organization || raw.salaryText || raw.deadline) ||
  /\b(vacancy|apply|hiring|recruit|salary|full[- ]time|part[- ]time)\b/i.test(`${raw.title} ${raw.summary ?? ''}`);
