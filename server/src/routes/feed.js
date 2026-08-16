import { Router } from 'express';
import { z } from 'zod';

import { actingUser, optionalAuth } from '../auth/guard.js';
import { distinctCategories, getItem, listItems, listItemsPaged, rankedForProfile } from '../store/items.js';
import { listJobsPaged } from '../store/jobs.js';

export const feedRouter = Router();

const listSchema = z.object({
  userId: z.string().optional(),
  kind: z.enum(['news', 'policy']).optional(),
  topics: z.string().optional(),
  audience: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  /** Legacy offset paging, kept so existing clients do not break. */
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const csv = (value) => (value ? value.split(',').map((entry) => entry.trim()).filter(Boolean) : []);

/** Resolve page/pageSize from either paging style. */
const paging = (query) => ({
  page: query.offset !== undefined && query.limit ? Math.floor(query.offset / query.limit) + 1 : query.page,
  pageSize: query.limit ?? query.pageSize,
});

const paged = async (query, extra = {}) =>
  await listItemsPaged({
    topics: csv(query.topics),
    audience: csv(query.audience),
    search: query.search,
    category: query.category,
    ...paging(query),
    ...extra,
  });

const envelope = (result, extra = {}) => ({
  items: result.data,
  data: result.data,
  page: result.page,
  pageSize: result.pageSize,
  total: result.total,
  pages: result.pages,
  ...extra,
});

/**
 * GET /api/feed
 * The home briefing. With a session (or a legacy `userId`) it is ranked against
 * that profile; otherwise it is reverse-chronological across every source.
 */
feedRouter.get('/feed', optionalAuth, async (request, response) => {
  const query = listSchema.parse(request.query);
  const user = await actingUser(request);

  if (user && !query.search) {
    const ranked = await rankedForProfile(user.profile, { limit: query.pageSize * query.page, kind: query.kind });
    return response.json({
      personalised: true,
      profileTopics: user.profile.topics,
      items: ranked,
      data: ranked,
      total: ranked.length,
      page: 1,
      pageSize: ranked.length,
      pages: 1,
    });
  }

  return response.json(envelope(await paged(query, { kind: query.kind }), { personalised: false }));
});

/** GET /api/news — journalism only. */
feedRouter.get('/news', async (request, response) => {
  const query = listSchema.parse(request.query);
  response.json(envelope(await paged(query, { kind: 'news' })));
});

/** GET /api/policies — official government and regulator output only. */
feedRouter.get('/policies', async (request, response) => {
  const query = listSchema.parse(request.query);
  response.json(envelope(await paged(query, { kind: 'policy' })));
});

feedRouter.get('/policies/categories', async (request, response) => {
  response.json({ categories: await distinctCategories() });
});

feedRouter.get('/items/:id', async (request, response) => {
  const item = await getItem(request.params.id);
  if (!item || item.status !== 'published') return response.status(404).json({ error: 'Item not found' });

  const related = (await listItems({ limit: 60 }))
    .filter((candidate) => candidate.id !== item.id)
    .map((candidate) => ({
      candidate,
      overlap: candidate.topics.filter((topic) => item.topics.includes(topic)).length,
    }))
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 4)
    .map((entry) => entry.candidate);

  return response.json({ item, related });
});

/** GET /api/search — one query across both content types (pr.md §30). */
feedRouter.get('/search', async (request, response) => {
  const query = z
    .object({
      q: z.string().min(2, 'Enter at least two characters').max(200),
      pageSize: z.coerce.number().int().min(1).max(50).default(10),
      page: z.coerce.number().int().min(1).default(1),
    })
    .parse(request.query);

  const jobs = await listJobsPaged({ search: query.q, page: query.page, pageSize: query.pageSize });
  const policies = await listItemsPaged({ search: query.q, page: query.page, pageSize: query.pageSize });

  response.json({
    query: query.q,
    jobs: { data: jobs.data, total: jobs.total },
    policies: { data: policies.data, total: policies.total },
    total: jobs.total + policies.total,
  });
});
