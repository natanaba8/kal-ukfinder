import { Router } from 'express';
import { z } from 'zod';

import { collectSource, previewSource } from '../../content/engine.js';
import { detectSource } from '../../content/detect.js';
import { scrapeLimiter } from '../../middleware/rate-limit.js';
import { lastRunFor } from '../../store/scrape-logs.js';
import {
  CONTENT_TYPES,
  METHODS,
  MODERATION_MODES,
  SELECTOR_FIELDS,
  TRUST_LEVELS,
  createSource,
  deleteSource,
  getSource,
  listSources,
  updateSource,
} from '../../store/sources.js';

export const adminSourcesRouter = Router();

const selectorsSchema = z
  .object(Object.fromEntries(SELECTOR_FIELDS.map((field) => [field, z.string().max(300).optional()])))
  .partial();

const sourceSchema = z.object({
  name: z.string().min(2).max(120),
  publisher: z.string().max(160).optional(),
  baseUrl: z.string().url('Enter the full website address, including https://'),
  contentType: z.enum(CONTENT_TYPES).default('POLICY'),
  method: z.enum(METHODS).default('AUTO'),
  rssUrl: z.string().url().optional().or(z.literal('')),
  apiUrl: z.string().url().optional().or(z.literal('')),
  apiProvider: z.string().max(40).optional(),
  scrapeUrl: z.string().url().optional().or(z.literal('')),
  selectors: selectorsSchema.optional(),
  requestHeaders: z.record(z.string(), z.string()).optional(),
  trust: z.enum(TRUST_LEVELS).default('trusted'),
  defaultTopics: z.array(z.string().max(40)).max(6).optional(),
  defaultAudience: z.array(z.string().max(40)).max(6).optional(),
  active: z.boolean().default(false),
  moderation: z.enum(MODERATION_MODES).default('AUTO_PUBLISH'),
  scrapeIntervalMinutes: z.number().int().min(5).max(10_080).default(30),
  maxItemsPerRun: z.number().int().min(1).max(100).default(15),
});

/** Empty strings from a form should be stored as null, not "". */
const clean = (input) => ({
  ...input,
  rssUrl: input.rssUrl || null,
  apiUrl: input.apiUrl || null,
  scrapeUrl: input.scrapeUrl || null,
});

adminSourcesRouter.get('/sources', (request, response) => {
  const query = z
    .object({
      search: z.string().optional(),
      contentType: z.enum(CONTENT_TYPES).optional(),
      method: z.enum(METHODS).optional(),
      status: z.string().optional(),
      active: z.enum(['true', 'false']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    })
    .parse(request.query);

  const result = listSources({
    ...query,
    active: query.active === undefined ? undefined : query.active === 'true',
  });

  response.json({
    ...result,
    data: result.data.map((source) => ({ ...source, lastRun: lastRunFor(source.id) })),
  });
});

adminSourcesRouter.get('/sources/:id', (request, response) => {
  const source = getSource(request.params.id);
  if (!source) return response.status(404).json({ error: 'Source not found' });
  return response.json({ source, lastRun: lastRunFor(source.id) });
});

adminSourcesRouter.post('/sources', (request, response) => {
  const body = sourceSchema.parse(request.body);

  if (body.method === 'SCRAPER' && !body.selectors?.item) {
    return response.status(400).json({
      error: 'A scraper source needs at least a list selector. Run Test first to have one suggested.',
      code: 'MISSING_SELECTORS',
    });
  }

  try {
    const source = createSource(clean(body), request.auth?.userId ?? null);
    return response.status(201).json({ source });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return response.status(409).json({ error: 'A source with that address already exists', code: 'DUPLICATE' });
    }
    throw error;
  }
});

adminSourcesRouter.patch('/sources/:id', (request, response) => {
  const body = sourceSchema.partial().parse(request.body);
  const source = updateSource(request.params.id, clean(body));
  if (!source) return response.status(404).json({ error: 'Source not found' });
  return response.json({ source });
});

adminSourcesRouter.delete('/sources/:id', (request, response) => {
  const removed = deleteSource(request.params.id);
  if (removed === 0) return response.status(404).json({ error: 'Source not found' });
  return response.json({ deleted: true });
});

adminSourcesRouter.post('/sources/:id/active', (request, response) => {
  const { active } = z.object({ active: z.boolean() }).parse(request.body);
  const source = updateSource(request.params.id, { active });
  if (!source) return response.status(404).json({ error: 'Source not found' });
  return response.json({ source });
});

/**
 * Auto-detect from a bare URL (pr.md §9, §32 step 3).
 * Writes nothing — it just tells the wizard how the site can be collected.
 */
adminSourcesRouter.post('/sources/detect', scrapeLimiter, async (request, response) => {
  const { url } = z.object({ url: z.string().min(4).max(500) }).parse(request.body);
  response.json(await detectSource(url));
});

/**
 * Dry run against a real site (pr.md §7, §10).
 * Accepts either a saved source id or an unsaved draft from the wizard.
 */
adminSourcesRouter.post('/sources/test', scrapeLimiter, async (request, response) => {
  const body = z
    .object({
      id: z.string().optional(),
      draft: sourceSchema.partial().optional(),
      limit: z.number().int().min(1).max(25).default(10),
    })
    .parse(request.body);

  const saved = body.id ? getSource(body.id) : null;
  if (body.id && !saved) return response.status(404).json({ error: 'Source not found' });

  const draft = body.draft ? clean(body.draft) : {};
  const source = {
    id: saved?.id ?? 'draft',
    name: draft.name ?? saved?.name ?? 'Draft source',
    baseUrl: draft.baseUrl ?? saved?.baseUrl,
    contentType: draft.contentType ?? saved?.contentType ?? 'POLICY',
    method: draft.method ?? saved?.method ?? 'AUTO',
    resolvedMethod: draft.method && draft.method !== 'AUTO' ? draft.method : saved?.resolvedMethod ?? null,
    rssUrl: draft.rssUrl ?? saved?.rssUrl ?? null,
    apiUrl: draft.apiUrl ?? saved?.apiUrl ?? null,
    apiProvider: draft.apiProvider ?? saved?.apiProvider ?? null,
    scrapeUrl: draft.scrapeUrl ?? saved?.scrapeUrl ?? null,
    selectors: draft.selectors ?? saved?.selectors ?? {},
    requestHeaders: draft.requestHeaders ?? saved?.requestHeaders ?? {},
    trust: draft.trust ?? saved?.trust ?? 'trusted',
    itemKind: (draft.trust ?? saved?.trust) === 'official' ? 'policy' : 'news',
    defaultTopics: draft.defaultTopics ?? saved?.defaultTopics ?? [],
    defaultAudience: draft.defaultAudience ?? saved?.defaultAudience ?? [],
    moderation: draft.moderation ?? saved?.moderation ?? 'AUTO_PUBLISH',
    maxItemsPerRun: draft.maxItemsPerRun ?? saved?.maxItemsPerRun ?? 15,
  };

  if (!source.baseUrl) {
    return response.status(400).json({ error: 'A website address is required before testing' });
  }

  return response.json(await previewSource(source, { limit: body.limit }));
});

/** Manual "Sync Now" (pr.md §12). */
adminSourcesRouter.post('/sources/:id/sync', scrapeLimiter, async (request, response) => {
  const source = getSource(request.params.id);
  if (!source) return response.status(404).json({ error: 'Source not found' });

  const result = await collectSource(source, { triggeredBy: 'admin' });
  return response.json(result);
});
