import { Router } from 'express';
import { z } from 'zod';

import { matchJobs, scoreJobLexically } from '../ai/coach.js';
import { actingUser, optionalAuth } from '../auth/guard.js';
import { searchJobs } from '../sources/jobs.js';
import {
  getJob,
  jobCategories,
  jobLocations,
  jobOrganizations,
  listJobs,
  listJobsPaged,
  upsertJob,
} from '../store/jobs.js';
import { getUser } from '../store/users.js';

export const jobsRouter = Router();

/** `z.coerce.boolean()` turns the string "false" into true — parse it properly. */
const boolish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) =>
    typeof value === 'string' ? ['true', '1', 'yes', 'on'].includes(value.toLowerCase()) : value,
  );

const searchSchema = z.object({
  userId: z.string().optional(),
  search: z.string().optional(),
  location: z.string().optional(),
  organization: z.string().optional(),
  remote: boolish,
  salaryMin: z.coerce.number().optional(),
  category: z.string().optional(),
  contractType: z.string().optional(),
  employmentType: z.string().optional(),
  openOnly: boolish,
  live: boolish,
  rank: z.enum(['recent', 'match']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  /** Legacy offset paging, kept so existing clients do not break. */
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * GET /api/jobs
 * Serves the cache by default. `live=true` also queries the configured job
 * boards for this exact search and folds the results into the cache first.
 */
jobsRouter.get('/jobs', optionalAuth, async (request, response) => {
  const query = searchSchema.parse(request.query);
  const user = actingUser(request);

  if (query.live) {
    const fresh = await searchJobs({
      query: query.search,
      location: query.location,
      salaryMin: query.salaryMin,
      remoteOnly: query.remote,
      perPage: 40,
    });
    for (const job of fresh) upsertJob(job);
  }

  const filters = {
    search: query.search,
    location: query.location,
    organization: query.organization,
    remoteOnly: query.remote,
    salaryMin: query.salaryMin,
    category: query.category,
    contractType: query.contractType,
    employmentType: query.employmentType,
    openOnly: query.openOnly,
  };

  // Offset paging still works for older clients; page/pageSize is the default.
  const page =
    query.offset !== undefined && query.limit
      ? Math.floor(query.offset / query.limit) + 1
      : query.page;
  const pageSize = query.limit ?? query.pageSize;

  const result = listJobsPaged({ ...filters, page, pageSize });

  const jobs = user
    ? result.data.map((job) => ({ ...job, match: scoreJobLexically(job, user.profile) }))
    : result.data;

  if (user && query.rank === 'match') jobs.sort((a, b) => b.match.score - a.match.score);

  return response.json({
    jobs,
    data: jobs,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    pages: result.pages,
    personalised: Boolean(user),
  });
});

/** Filter options for the mobile filter sheet (pr.md §23). */
jobsRouter.get('/jobs/categories', (request, response) => {
  response.json({
    categories: jobCategories(),
    locations: jobLocations(),
    organizations: jobOrganizations(),
  });
});

jobsRouter.get('/jobs/:id', optionalAuth, (request, response) => {
  const job = getJob(request.params.id);
  if (!job || job.status !== 'published') return response.status(404).json({ error: 'Job not found' });

  const user = actingUser(request);
  return response.json({
    job,
    match: user ? scoreJobLexically(job, user.profile) : null,
    similar: listJobs({ search: job.category ?? job.title.split(' ')[0], limit: 5 }).filter(
      (candidate) => candidate.id !== job.id,
    ),
  });
});

const matchSchema = z.object({
  userId: z.string().optional(),
  jobIds: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(20).default(10),
});

/** POST /api/jobs/match — AI-ranked shortlist with reasons and gaps. */
jobsRouter.post('/jobs/match', optionalAuth, async (request, response) => {
  const body = matchSchema.parse(request.body);
  const user = actingUser(request);
  if (!user) return response.status(401).json({ error: 'Sign in to get personalised matches' });

  const pool = body.jobIds?.length
    ? body.jobIds.map((id) => getJob(id)).filter(Boolean)
    : listJobs({
        location: user.profile.remoteOnly ? undefined : user.profile.location || undefined,
        remoteOnly: user.profile.remoteOnly,
        salaryMin: user.profile.salaryMin ?? undefined,
        limit: 20,
      });

  const matches = await matchJobs({ jobs: pool, profile: user.profile });
  const byId = new Map(pool.map((job) => [job.id, job]));

  return response.json({
    matches: matches
      .slice(0, body.limit)
      .map((match) => ({ ...match, job: byId.get(match.id) }))
      .filter((entry) => entry.job),
  });
});
