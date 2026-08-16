import { Router } from 'express';
import { z } from 'zod';

import {
  deleteItem,
  distinctCategories,
  getItem,
  listItemsPaged,
  setItemFeatured,
  setItemStatus,
  updateItemMeta,
} from '../../store/items.js';
import {
  deleteJob,
  getJob,
  jobCategories,
  jobLocations,
  jobOrganizations,
  listJobsPaged,
  setJobFeatured,
  setJobStatus,
  updateJobMeta,
} from '../../store/jobs.js';

export const adminContentRouter = Router();

const STATUSES = ['published', 'pending', 'hidden'];

const listQuery = z.object({
  search: z.string().optional(),
  status: z.enum([...STATUSES, 'all']).default('all'),
  category: z.string().optional(),
  sourceId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** `all` means "do not filter"; the store treats null status as unfiltered. */
const statusFilter = (status) => (status === 'all' ? null : status);

// --- jobs -------------------------------------------------------------------

adminContentRouter.get('/jobs', async (request, response) => {
  const query = listQuery.extend({ location: z.string().optional() }).parse(request.query);

  response.json(
    await listJobsPaged({
      search: query.search,
      status: statusFilter(query.status),
      category: query.category,
      location: query.location,
      sourceId: query.sourceId,
      page: query.page,
      pageSize: query.pageSize,
    }),
  );
});

adminContentRouter.get('/jobs/filters', async (request, response) => {
  response.json({
    categories: await jobCategories(),
    locations: await jobLocations(),
    organizations: await jobOrganizations(),
  });
});

adminContentRouter.patch('/jobs/:id', async (request, response) => {
  const body = z
    .object({
      status: z.enum(STATUSES).optional(),
      featured: z.boolean().optional(),
      category: z.string().max(120).nullable().optional(),
      employmentType: z.string().max(60).nullable().optional(),
      location: z.string().max(200).nullable().optional(),
      deadline: z.string().max(40).nullable().optional(),
    })
    .parse(request.body);

  if (!await getJob(request.params.id)) return response.status(404).json({ error: 'Job not found' });

  if (body.status) await setJobStatus(request.params.id, body.status);
  if (body.featured !== undefined) await setJobFeatured(request.params.id, body.featured);

  const job = await updateJobMeta(request.params.id, body);
  return response.json({ job });
});

adminContentRouter.delete('/jobs/:id', async (request, response) => {
  const removed = await deleteJob(request.params.id);
  if (removed === 0) return response.status(404).json({ error: 'Job not found' });
  return response.json({ deleted: true });
});

// --- policies / articles ----------------------------------------------------

adminContentRouter.get('/policies', async (request, response) => {
  const query = listQuery.parse(request.query);

  response.json(
    await listItemsPaged({
      search: query.search,
      status: statusFilter(query.status),
      category: query.category,
      sourceId: query.sourceId,
      page: query.page,
      pageSize: query.pageSize,
    }),
  );
});

adminContentRouter.get('/policies/filters', async (request, response) => {
  response.json({ categories: await distinctCategories() });
});

adminContentRouter.patch('/policies/:id', async (request, response) => {
  const body = z
    .object({
      status: z.enum(STATUSES).optional(),
      featured: z.boolean().optional(),
      category: z.string().max(120).nullable().optional(),
      topics: z.array(z.string().max(40)).max(6).optional(),
      audience: z.array(z.string().max(40)).max(6).optional(),
      importance: z.number().int().min(1).max(5).optional(),
    })
    .parse(request.body);

  if (!await getItem(request.params.id)) return response.status(404).json({ error: 'Article not found' });

  if (body.status) await setItemStatus(request.params.id, body.status);
  if (body.featured !== undefined) await setItemFeatured(request.params.id, body.featured);

  const item = await updateItemMeta(request.params.id, body);
  return response.json({ item });
});

adminContentRouter.delete('/policies/:id', async (request, response) => {
  const removed = await deleteItem(request.params.id);
  if (removed === 0) return response.status(404).json({ error: 'Article not found' });
  return response.json({ deleted: true });
});

/** Bulk moderation so a queue can be cleared without 40 clicks. */
adminContentRouter.post('/bulk', async (request, response) => {
  const body = z
    .object({
      entity: z.enum(['job', 'policy']),
      ids: z.array(z.string()).min(1).max(200),
      action: z.enum(['publish', 'hide', 'feature', 'unfeature', 'delete']),
    })
    .parse(request.body);

  const isJob = body.entity === 'job';
  let affected = 0;

  for (const id of body.ids) {
    switch (body.action) {
      case 'publish':
        affected += isJob ? await setJobStatus(id, 'published') : await setItemStatus(id, 'published');
        break;
      case 'hide':
        affected += isJob ? await setJobStatus(id, 'hidden') : await setItemStatus(id, 'hidden');
        break;
      case 'feature':
        affected += isJob ? await setJobFeatured(id, true) : await setItemFeatured(id, true);
        break;
      case 'unfeature':
        affected += isJob ? await setJobFeatured(id, false) : await setItemFeatured(id, false);
        break;
      case 'delete':
        affected += isJob ? await deleteJob(id) : await deleteItem(id);
        break;
      default:
        break;
    }
  }

  return response.json({ affected });
});
