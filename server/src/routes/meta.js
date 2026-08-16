import { Router } from 'express';

import { isAiEnabled } from '../ai/gemini.js';
import { adminOnly } from '../auth/guard.js';
import { config } from '../config.js';
import { AUDIENCES, EXPERIENCE_LEVELS, TOPICS, UK_REGIONS } from '../constants.js';
import { lastIngestRun, isIngestRunning, runIngest } from '../ingest.js';
import { jobProvidersConfigured } from '../sources/jobs.js';
import { countItems, latestPublishedAt } from '../store/items.js';
import { countJobs } from '../store/jobs.js';
import { listSources, sourceCounts } from '../store/sources.js';

export const metaRouter = Router();

metaRouter.get('/health', (request, response) => {
  response.json({ ok: true, service: 'kal-ukfinder-api', time: new Date().toISOString() });
});

metaRouter.get('/status', async (request, response) => {
  response.json({
    items: await countItems(),
    jobs: await countJobs(),
    latestItemPublishedAt: await latestPublishedAt(),
    ai: {
      enabled: isAiEnabled(),
      fastModel: isAiEnabled() ? config.ai.fastModel : null,
      smartModel: isAiEnabled() ? config.ai.smartModel : null,
      mode: isAiEnabled() ? 'gemini' : 'rule-based',
    },
    jobProviders: jobProvidersConfigured(),
    sources: (await sourceCounts()).active,
    sourceHealth: await sourceCounts(),
    ingest: {
      running: isIngestRunning(),
      scheduled: config.ingest.enabled,
      cron: config.ingest.cron,
      last: await lastIngestRun(),
    },
  });
});

metaRouter.get('/taxonomy', (request, response) => {
  response.json({
    topics: TOPICS,
    audiences: AUDIENCES,
    regions: UK_REGIONS,
    experienceLevels: EXPERIENCE_LEVELS,
  });
});

/**
 * The public "where this comes from" register. Reads the live source table, so
 * a source an admin adds in the panel shows up here without a deploy.
 */
metaRouter.get('/sources', async (request, response) => {
  const { data } = await listSources({ active: true, pageSize: 200 });

  response.json({
    sources: data.map((source) => ({
      id: source.id,
      name: source.name,
      publisher: source.publisher,
      kind: source.itemKind,
      contentType: source.contentType,
      method: source.resolvedMethod ?? source.method,
      trust: source.trust,
      topics: source.defaultTopics,
    })),
  });
});

/**
 * Manual full refresh. Behind the admin guard like every other /admin route —
 * it hits every configured third-party site, so it is not something an
 * anonymous caller should be able to trigger.
 */
metaRouter.post('/admin/ingest', adminOnly, async (request, response) => {
  response.json(await runIngest({ triggeredBy: 'admin' }));
});
