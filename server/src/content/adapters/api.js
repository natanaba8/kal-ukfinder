import { stripHtml } from '../../sources/rss.js';
import { fetchAdzuna, fetchReed, fetchSample } from '../../sources/jobs.js';
import { politeFetchJson } from '../fetcher.js';

/**
 * Official-API adapter — second in pr.md §40's preference order, ahead of
 * scraping and behind RSS only because feeds need no credentials.
 *
 * Two shapes are supported: the job boards this project already integrates
 * (Adzuna, Reed) and a generic JSON endpoint whose fields are mapped with the
 * same selector object the scraper uses, but as dot-paths instead of CSS.
 */

/** `results.items` → walks nested objects; returns undefined if any hop is missing. */
const readPath = (value, path) => {
  if (!path) return undefined;
  return path.split('.').reduce((current, key) => (current == null ? undefined : current[key]), value);
};

const providerJob = (job) => ({
  title: job.title,
  url: job.url,
  summary: job.description,
  publishedAt: job.postedAt,
  organization: job.company,
  location: job.location,
  region: job.region,
  remote: job.remote,
  salaryText: job.salaryText,
  salaryMin: job.salaryMin,
  salaryMax: job.salaryMax,
  employmentType: job.contractType,
  categories: job.category ? [job.category] : [],
  externalId: job.externalId,
});

const PROVIDERS = {
  async adzuna(source, limit) {
    const jobs = await fetchAdzuna({ perPage: Math.min(50, limit) });
    if (jobs === null) {
      throw Object.assign(new Error('Adzuna credentials are not configured'), { code: 'NOT_CONFIGURED' });
    }
    return jobs.map(providerJob);
  },

  async reed(source, limit) {
    const jobs = await fetchReed({ perPage: Math.min(50, limit) });
    if (jobs === null) {
      throw Object.assign(new Error('Reed credentials are not configured'), { code: 'NOT_CONFIGURED' });
    }
    return jobs.map(providerJob);
  },

  async sample(source, limit) {
    return fetchSample({}).slice(0, limit).map(providerJob);
  },
};

const collectGeneric = async (source, limit) => {
  const url = source.apiUrl ?? source.baseUrl;
  const { json, finalUrl } = await politeFetchJson(url, { headers: source.requestHeaders });
  const selectors = source.selectors ?? {};

  const collection = selectors.item ? readPath(json, selectors.item) : json;
  const rows = Array.isArray(collection) ? collection : Array.isArray(json) ? json : null;

  if (!rows) {
    throw Object.assign(
      new Error(
        selectors.item
          ? `No array found at "${selectors.item}" in the response`
          : 'The response was not an array — set a list path so the items can be found',
      ),
      { code: 'NO_ARRAY' },
    );
  }

  const items = rows
    .slice(0, limit)
    .map((row) => {
      const title = stripHtml(String(readPath(row, selectors.title ?? 'title') ?? ''));
      const href = String(readPath(row, selectors.url ?? 'url') ?? '');
      if (!title || !href) return null;

      const dateValue = readPath(row, selectors.date ?? 'publishedAt');
      const parsedDate = dateValue ? new Date(dateValue) : null;

      return {
        title,
        url: new URL(href, finalUrl).toString(),
        summary: stripHtml(String(readPath(row, selectors.description ?? 'description') ?? '')),
        publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
        imageUrl: readPath(row, selectors.image) ?? null,
        organization: readPath(row, selectors.organization) ?? null,
        location: readPath(row, selectors.location) ?? null,
        salaryText: readPath(row, selectors.salary) ?? null,
        categories: [readPath(row, selectors.category)].filter(Boolean),
      };
    })
    .filter(Boolean);

  if (items.length === 0) {
    throw Object.assign(new Error(`Found ${rows.length} records, but none had both a title and a URL`), {
      code: 'NO_USABLE_ITEMS',
    });
  }

  return { items, totalAvailable: rows.length };
};

export const apiAdapter = {
  method: 'API',

  endpoint: (source) => source.apiUrl ?? source.baseUrl,

  async collect(source, { limit = 30 } = {}) {
    const provider = PROVIDERS[source.apiProvider ?? ''];

    if (provider) {
      const items = await provider(source, limit);
      return { method: 'API', endpoint: source.apiProvider, items, totalAvailable: items.length };
    }

    const { items, totalAvailable } = await collectGeneric(source, limit);
    return { method: 'API', endpoint: apiAdapter.endpoint(source), items, totalAvailable };
  },
};

export const KNOWN_PROVIDERS = Object.keys(PROVIDERS);
