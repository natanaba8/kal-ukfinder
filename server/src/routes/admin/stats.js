import { Router } from 'express';
import { z } from 'zod';

import { isAiEnabled } from '../../ai/gemini.js';
import { config } from '../../config.js';
import { db } from '../../db.js';
import { isRunning, tick } from '../../scheduler/index.js';
import { itemCounts, listItems } from '../../store/items.js';
import { jobCounts, listJobs } from '../../store/jobs.js';
import { listRuns, runErrors, runSummary } from '../../store/scrape-logs.js';
import { sourceCounts } from '../../store/sources.js';
import { userCounts } from '../../store/users.js';

export const adminStatsRouter = Router();

/** Everything the dashboard needs, in one request (pr.md §5). */
adminStatsRouter.get('/stats', async (request, response) => {
  const jobs = await jobCounts();
  const policies = await itemCounts();
  const sources = await sourceCounts();
  const users = await userCounts();
  const runs = await runSummary();

  response.json({
    cards: {
      totalJobs: jobs.total,
      totalPolicies: policies.total,
      activeSources: sources.active,
      failingSources: sources.failing,
      totalUsers: users.total,
      jobsToday: jobs.today,
      policiesToday: policies.today,
      pendingReview: jobs.pending + policies.pending,
    },
    jobs,
    policies,
    sources,
    users,
    scraping: {
      ...runs,
      schedulerRunning: isRunning(),
      schedulerEnabled: config.ingest.enabled,
    },
    ai: { enabled: isAiEnabled(), mode: isAiEnabled() ? 'gemini' : 'rule-based' },
    latest: {
      jobs: (await listJobs({ limit: 5, status: null })).map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        postedAt: job.postedAt,
        status: job.status,
      })),
      policies: (await listItems({ limit: 5, status: null })).map((item) => ({
        id: item.id,
        headline: item.headline,
        source: item.source.name,
        publishedAt: item.publishedAt,
        status: item.status,
      })),
      runs: (await listRuns({ pageSize: 8 })).data,
    },
  });
});

/** Collection volume per day, for the analytics page. */
adminStatsRouter.get('/analytics', async (request, response) => {
  const days = z.coerce.number().int().min(1).max(90).default(14).parse(request.query.days ?? 14);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const byDay = async (table, column) =>
    (await db.all(`
        SELECT substr(${column}, 1, 10) AS day, COUNT(*) AS total
          FROM ${table} WHERE ${column} >= ? GROUP BY day ORDER BY day
      `, [since]));

  const perSource = (await db.all(`
      SELECT s.id, s.name,
             COUNT(r.id) AS runs,
             SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END) AS successes,
             COALESCE(SUM(r.items_new), 0) AS items
        FROM sources s
        LEFT JOIN scrape_runs r ON r.source_id = s.id AND r.started_at >= ?
       GROUP BY s.id
       ORDER BY items DESC
       LIMIT 30
    `, [since]));

  const [jobsPerDay, policiesPerDay, usersPerDay] = await Promise.all([
    byDay('jobs', 'created_at'),
    byDay('items', 'created_at'),
    byDay('users', 'created_at'),
  ]);

  response.json({
    days,
    jobsPerDay,
    policiesPerDay,
    usersPerDay,
    perSource: perSource.map((row) => ({
      id: row.id,
      name: row.name,
      runs: row.runs,
      successes: row.successes ?? 0,
      successRate: row.runs > 0 ? Math.round(((row.successes ?? 0) / row.runs) * 100) : null,
      items: row.items,
    })),
  });
});

// --- scrape logs (pr.md §33) -------------------------------------------------

adminStatsRouter.get('/scrape-runs', async (request, response) => {
  const query = z
    .object({
      sourceId: z.string().optional(),
      status: z.enum(['running', 'success', 'failed', 'skipped']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    })
    .parse(request.query);

  response.json(await listRuns(query));
});

adminStatsRouter.get('/scrape-runs/:id/errors', async (request, response) => {
  response.json({ errors: await runErrors(request.params.id) });
});

/** Run the scheduler tick immediately. */
adminStatsRouter.post('/sync', async (request, response) => {
  response.json(await tick({ triggeredBy: 'admin' }));
});

// --- settings (pr.md §31) ----------------------------------------------------

const readSetting = async (key, fallback) => {
  const row = (await db.get('SELECT value FROM settings WHERE key = ?', [key]));
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
};

adminStatsRouter.get('/settings', async (request, response) => {
  response.json({
    settings: {
      defaultScrapeIntervalMinutes: await readSetting('defaultScrapeIntervalMinutes', 30),
      defaultModeration: await readSetting('defaultModeration', 'AUTO_PUBLISH'),
      retentionDays: await readSetting('retentionDays', config.ingest.retentionDays),
      allowRegistration: await readSetting('allowRegistration', config.auth.allowRegistration),
    },
    readOnly: {
      aiEnabled: isAiEnabled(),
      respectRobots: config.ingest.respectRobots,
      userAgent: config.ingest.userAgent,
      politenessMs: config.ingest.politenessMs,
      concurrency: config.ingest.concurrency,
    },
  });
});

adminStatsRouter.put('/settings', async (request, response) => {
  const body = z
    .object({
      defaultScrapeIntervalMinutes: z.number().int().min(5).max(10_080).optional(),
      defaultModeration: z.enum(['AUTO_PUBLISH', 'REQUIRE_APPROVAL']).optional(),
      retentionDays: z.number().int().min(1).max(365).optional(),
      allowRegistration: z.boolean().optional(),
    })
    .parse(request.body);

  const UPSERT_SETTING = `
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `;

  // One transaction so a half-saved settings page is not possible.
  await db.tx(async (tx) => {
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      await tx.run(UPSERT_SETTING, [key, JSON.stringify(value), new Date().toISOString()]);
    }
  });

  return response.json({ saved: true });
});
