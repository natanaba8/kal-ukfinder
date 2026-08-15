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

adminContentRouter.get('/jobs', (request, response) => {
  const query = listQuery.extend({ location: z.string().optional() }).parse(request.query);

  response.json(
    listJobsPaged({
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

adminContentRouter.get('/jobs/filters', (request, response) => {
  response.json({
    categories: jobCategories(),
    locations: jobLocations(),
    organizations: jobOrganizations(),
  });
});

adminContentRouter.patch('/jobs/:id', (request, response) => {
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

  if (!getJob(request.params.id)) return response.status(404).json({ error: 'Job not found' });

  if (body.status) setJobStatus(request.params.id, body.status);
  if (body.featured !== undefined) setJobFeatured(request.params.id, body.featured);

  const job = updateJobMeta(request.params.id, body);
  return response.json({ job });
});

adminContentRouter.delete('/jobs/:id', (request, response) => {
  const removed = deleteJob(request.params.id);
  if (removed === 0) return response.status(404).json({ error: 'Job not found' });
  return response.json({ deleted: true });
});

// --- policies / articles ----------------------------------------------------

adminContentRouter.get('/policies', (request, response) => {
  const query = listQuery.parse(request.query);

  response.json(
    listItemsPaged({
      search: query.search,
      status: statusFilter(query.status),
      category: query.category,
      sourceId: query.sourceId,
      page: query.page,
      pageSize: query.pageSize,
    }),
  );
});

adminContentRouter.get('/policies/filters', (request, response) => {
  response.json({ categories: distinctCategories() });
});

adminContentRouter.patch('/policies/:id', (request, response) => {
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

  if (!getItem(request.params.id)) return response.status(404).json({ error: 'Article not found' });

  if (body.status) setItemStatus(request.params.id, body.status);
  if (body.featured !== undefined) setItemFeatured(request.params.id, body.featured);

  const item = updateItemMeta(request.params.id, body);
  return response.json({ item });
});

adminContentRouter.delete('/policies/:id', (request, response) => {
  const removed = deleteItem(request.params.id);
  if (removed === 0) return response.status(404).json({ error: 'Article not found' });
  return response.json({ deleted: true });
});

/** Bulk moderation so a queue can be cleared without 40 clicks. */
adminContentRouter.post('/bulk', (request, response) => {
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
        affected += isJob ? setJobStatus(id, 'published') : setItemStatus(id, 'published');
        break;
      case 'hide':
        affected += isJob ? setJobStatus(id, 'hidden') : setItemStatus(id, 'hidden');
        break;
      case 'feature':
        affected += isJob ? setJobFeatured(id, true) : setItemFeatured(id, true);
        break;
      case 'unfeature':
        affected += isJob ? setJobFeatured(id, false) : setItemFeatured(id, false);
        break;
      case 'delete':
        affected += isJob ? deleteJob(id) : deleteItem(id);
        break;
      default:
        break;
    }
  }

  return response.json({ affected });
});
