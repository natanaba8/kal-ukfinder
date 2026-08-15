import { config } from '../config.js';
import { createLogger } from '../logger.js';
import { stripHtml } from './rss.js';
import { SAMPLE_JOBS } from './sample-jobs.js';

const log = createLogger('jobs');

const REMOTE_PATTERN = /\b(remote|work from home|wfh|home[- ]based|hybrid)\b/i;

const normalise = (job) => ({
  ...job,
  title: stripHtml(job.title),
  company: stripHtml(job.company ?? ''),
  description: stripHtml(job.description ?? '').slice(0, 4000),
  remote: job.remote ?? REMOTE_PATTERN.test(`${job.title} ${job.location} ${job.description ?? ''}`),
});

/** Adzuna — free developer tier, best coverage of UK listings. */
export const fetchAdzuna = async ({ query, location, page = 1, perPage = 30, salaryMin, remoteOnly }) => {
  const { adzunaAppId, adzunaAppKey } = config.jobs;
  if (!adzunaAppId || !adzunaAppKey) return null;

  const url = new URL(`https://api.adzuna.com/v1/api/jobs/gb/search/${page}`);
  url.searchParams.set('app_id', adzunaAppId);
  url.searchParams.set('app_key', adzunaAppKey);
  url.searchParams.set('results_per_page', String(perPage));
  url.searchParams.set('content-type', 'application/json');
  if (query) url.searchParams.set('what', query);
  if (location) url.searchParams.set('where', location);
  if (salaryMin) url.searchParams.set('salary_min', String(salaryMin));
  if (remoteOnly) url.searchParams.set('what_or', 'remote hybrid home based');

  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    log.warn(`adzuna -> HTTP ${response.status}`);
    return null;
  }

  const payload = await response.json();
  return (payload.results ?? []).map((result) =>
    normalise({
      source: 'adzuna',
      externalId: String(result.id),
      title: result.title ?? 'Untitled role',
      company: result.company?.display_name ?? '',
      location: result.location?.display_name ?? 'United Kingdom',
      region: result.location?.area?.[1] ?? 'UK wide',
      salaryMin: result.salary_min ?? null,
      salaryMax: result.salary_max ?? null,
      salaryText: result.salary_min
        ? `£${Math.round(result.salary_min).toLocaleString('en-GB')}${
            result.salary_max && result.salary_max !== result.salary_min
              ? ` – £${Math.round(result.salary_max).toLocaleString('en-GB')}`
              : ''
          }`
        : null,
      contractType: result.contract_time ?? result.contract_type ?? null,
      category: result.category?.label ?? null,
      url: result.redirect_url,
      description: result.description ?? '',
      postedAt: result.created ?? new Date().toISOString(),
    }),
  );
};

/** Reed.co.uk — good for professional/office roles. */
export const fetchReed = async ({ query, location, perPage = 30, salaryMin }) => {
  const { reedApiKey } = config.jobs;
  if (!reedApiKey) return null;

  const url = new URL('https://www.reed.co.uk/api/1.0/search');
  url.searchParams.set('resultsToTake', String(perPage));
  if (query) url.searchParams.set('keywords', query);
  if (location) url.searchParams.set('locationName', location);
  if (salaryMin) url.searchParams.set('minimumSalary', String(salaryMin));

  const auth = Buffer.from(`${reedApiKey}:`).toString('base64');
  const response = await fetch(url, {
    headers: { authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    log.warn(`reed -> HTTP ${response.status}`);
    return null;
  }

  const payload = await response.json();
  return (payload.results ?? []).map((result) =>
    normalise({
      source: 'reed',
      externalId: String(result.jobId),
      title: result.jobTitle ?? 'Untitled role',
      company: result.employerName ?? '',
      location: result.locationName ?? 'United Kingdom',
      region: result.locationName ?? 'UK wide',
      salaryMin: result.minimumSalary ?? null,
      salaryMax: result.maximumSalary ?? null,
      salaryText: result.minimumSalary
        ? `£${Math.round(result.minimumSalary).toLocaleString('en-GB')} – £${Math.round(
            result.maximumSalary ?? result.minimumSalary,
          ).toLocaleString('en-GB')}`
        : null,
      contractType: result.fullTime ? 'full_time' : result.partTime ? 'part_time' : null,
      category: null,
      url: result.jobUrl,
      description: result.jobDescription ?? '',
      postedAt: result.date ? new Date(result.date.split('/').reverse().join('-')).toISOString() : new Date().toISOString(),
    }),
  );
};

/**
 * Offline/demo provider. Used when no job-board keys are configured so the app
 * is never empty — every row is flagged `source: 'sample'` and the UI labels it.
 */
export const fetchSample = ({ query, location, salaryMin, remoteOnly }) => {
  const needle = (query ?? '').toLowerCase().trim();
  const place = (location ?? '').toLowerCase().trim();

  return SAMPLE_JOBS.filter((job) => {
    const haystack = `${job.title} ${job.company} ${job.category} ${job.description}`.toLowerCase();
    if (needle && !needle.split(/\s+/).some((word) => haystack.includes(word))) return false;
    if (place && !`${job.location} ${job.region}`.toLowerCase().includes(place)) return false;
    if (salaryMin && (job.salaryMax ?? job.salaryMin ?? 0) < salaryMin) return false;
    if (remoteOnly && !job.remote) return false;
    return true;
  }).map((job) => normalise({ ...job, source: 'sample' }));
};

/**
 * Query every configured job board and merge the results.
 * Falls back to the bundled sample set when nothing is configured.
 */
export const searchJobs = async (params = {}) => {
  const providers = await Promise.allSettled([fetchAdzuna(params), fetchReed(params)]);

  const live = providers
    .filter((result) => result.status === 'fulfilled' && Array.isArray(result.value))
    .flatMap((result) => result.value);

  providers
    .filter((result) => result.status === 'rejected')
    .forEach((result) => log.warn(`provider failed: ${result.reason?.message ?? result.reason}`));

  if (live.length > 0) return live;

  return fetchSample(params);
};

export const jobProvidersConfigured = () => {
  const providers = [];
  if (config.jobs.adzunaAppId && config.jobs.adzunaAppKey) providers.push('adzuna');
  if (config.jobs.reedApiKey) providers.push('reed');
  return providers.length > 0 ? providers : ['sample'];
};
