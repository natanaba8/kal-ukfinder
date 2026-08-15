import { enrichBatch } from '../ai/enrich.js';
import { createLogger } from '../logger.js';
import { idForUrl, insertItem } from '../store/items.js';
import { upsertJob } from '../store/jobs.js';
import { finishRun, logError, startRun } from '../store/scrape-logs.js';
import { recordSyncResult } from '../store/sources.js';
import { apiAdapter } from './adapters/api.js';
import { rssAdapter } from './adapters/rss.js';
import { scraperAdapter } from './adapters/scraper.js';
import { findItemDuplicate, findJobDuplicate } from './dedupe.js';
import { detectSource } from './detect.js';
import { FetchRefused } from './fetcher.js';
import { looksLikeJob, normaliseJob, normalisePolicy } from './normalise.js';

const log = createLogger('engine');

const ADAPTERS = {
  RSS: rssAdapter,
  API: apiAdapter,
  SCRAPER: scraperAdapter,
};

const ENRICH_BATCH_SIZE = 6;

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

/**
 * Resolve which adapter to use.
 *
 * A source set to AUTO is detected once and the answer is written back, so the
 * detection cost is paid on the first run rather than every run.
 */
export const resolveAdapter = async (source) => {
  const declared = source.method === 'AUTO' ? source.resolvedMethod : source.method;
  if (declared && ADAPTERS[declared]) return { adapter: ADAPTERS[declared], method: declared, detected: null };

  const detection = await detectSource(source.baseUrl);
  if (!detection.ok) {
    throw Object.assign(new Error(detection.reason), { code: detection.code ?? 'NOT_DETECTED' });
  }

  return { adapter: ADAPTERS[detection.method], method: detection.method, detected: detection };
};

/**
 * Collect from a source without writing anything.
 * This is what the admin panel's "Test Source" button calls (pr.md §7, §10).
 */
export const previewSource = async (source, { limit = 10 } = {}) => {
  const started = Date.now();

  try {
    const { adapter, method, detected } = await resolveAdapter(source);
    const result = await adapter.collect({ ...source, resolvedMethod: method }, { limit });

    const preview = result.items.map((raw) => {
      const asJob =
        source.contentType === 'JOB' || (source.contentType === 'BOTH' && looksLikeJob(raw));
      return asJob
        ? { type: 'job', ...normaliseJob(raw, source) }
        : { type: 'policy', ...normalisePolicy(raw, source) };
    });

    const fieldCoverage = {};
    for (const field of ['title', 'url', 'publishedAt', 'organization', 'location', 'deadline', 'summary']) {
      fieldCoverage[field] = result.items.filter((item) => Boolean(item[field])).length;
    }

    return {
      ok: true,
      method,
      endpoint: result.endpoint,
      detected,
      itemsFound: result.totalAvailable ?? result.items.length,
      sampleSize: result.items.length,
      fieldCoverage,
      fieldHits: result.fieldHits ?? null,
      jobs: preview.filter((entry) => entry.type === 'job').length,
      policies: preview.filter((entry) => entry.type === 'policy').length,
      preview: preview.slice(0, 5),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      method: source.resolvedMethod ?? source.method,
      code: error.code ?? (error instanceof FetchRefused ? error.code : 'FAILED'),
      reason: error.message,
      durationMs: Date.now() - started,
    };
  }
};

/**
 * Collect a source for real: fetch → normalise → dedupe → enrich → store.
 *
 * Never throws. A failing source is recorded against itself and the caller
 * moves on, which is pr.md §38's "one failed source must not stop the system".
 */
export const collectSource = async (source, { triggeredBy = 'scheduler', limit } = {}) => {
  const started = Date.now();
  const runId = startRun({ sourceId: source.id, method: source.resolvedMethod ?? source.method, triggeredBy });

  const stats = {
    sourceId: source.id,
    sourceName: source.name,
    itemsFound: 0,
    itemsNew: 0,
    itemsUpdated: 0,
    itemsDuplicate: 0,
    errorCount: 0,
  };

  try {
    const { adapter, method, detected } = await resolveAdapter(source);

    // Remember what AUTO resolved to, and any URL detection found for us.
    if (detected) {
      const { updateSource } = await import('../store/sources.js');
      updateSource(source.id, {
        resolvedMethod: method,
        rssUrl: detected.rssUrl ?? source.rssUrl,
        apiUrl: detected.apiUrl ?? source.apiUrl,
        scrapeUrl: detected.scrapeUrl ?? source.scrapeUrl,
        selectors: detected.selectors ?? source.selectors,
      });
      Object.assign(source, {
        resolvedMethod: method,
        rssUrl: detected.rssUrl ?? source.rssUrl,
        apiUrl: detected.apiUrl ?? source.apiUrl,
        scrapeUrl: detected.scrapeUrl ?? source.scrapeUrl,
        selectors: detected.selectors ?? source.selectors,
      });
    }

    const result = await adapter.collect(
      { ...source, resolvedMethod: method },
      { limit: limit ?? source.maxItemsPerRun },
    );
    stats.itemsFound = result.items.length;

    // --- split into jobs and articles ------------------------------------
    const jobs = [];
    const policies = [];

    for (const raw of result.items) {
      const asJob = source.contentType === 'JOB' || (source.contentType === 'BOTH' && looksLikeJob(raw));
      if (asJob) jobs.push(normaliseJob(raw, source));
      else policies.push(normalisePolicy(raw, source));
    }

    // --- jobs: dedupe then store -----------------------------------------
    for (const job of jobs) {
      const duplicate = findJobDuplicate(job);
      if (duplicate.duplicate && duplicate.reason !== 'url') {
        stats.itemsDuplicate += 1;
        continue;
      }

      try {
        upsertJob(job);
        if (duplicate.duplicate) stats.itemsUpdated += 1;
        else stats.itemsNew += 1;
      } catch (error) {
        stats.errorCount += 1;
        logError({ runId, sourceId: source.id, stage: 'store', message: error.message, detail: job.url });
      }
    }

    // --- articles: dedupe, enrich in batches, then store -------------------
    const fresh = [];
    for (const policy of policies) {
      const duplicate = findItemDuplicate(policy);
      if (duplicate.duplicate) {
        stats.itemsDuplicate += 1;
        continue;
      }
      fresh.push(policy);
    }

    for (const batch of chunk(fresh, ENRICH_BATCH_SIZE)) {
      const enrichments = await enrichBatch(
        batch.map((item) => ({
          title: item.title,
          summary: item.rawSummary,
          kind: item.kind,
          sourceName: item.sourceName,
          hints: item.hints,
          audienceHints: item.audienceHints,
        })),
      );

      batch.forEach((item, index) => {
        const enrichment = enrichments[index];
        try {
          const outcome = insertItem({
            ...item,
            id: idForUrl(item.url),
            headline: enrichment.headline,
            bullets: enrichment.bullets,
            impact: enrichment.impact,
            action: enrichment.action,
            topics: enrichment.topics,
            audience: enrichment.audience,
            region: 'UK',
            importance: enrichment.importance,
            readingMinutes: enrichment.readingMinutes,
            aiModel: enrichment.model,
          });
          if (outcome.changes > 0) stats.itemsNew += 1;
          else stats.itemsDuplicate += 1;
        } catch (error) {
          stats.errorCount += 1;
          logError({ runId, sourceId: source.id, stage: 'store', message: error.message, detail: item.url });
        }
      });
    }

    const status = stats.errorCount > 0 && stats.itemsNew === 0 ? 'failed' : 'success';
    finishRun(runId, { ...stats, status, method, startedAtMs: started });
    recordSyncResult(source.id, { status });

    log.info(
      `${source.name}: ${stats.itemsNew} new, ${stats.itemsUpdated} updated, ${stats.itemsDuplicate} duplicate`,
    );

    return { ...stats, status, method, runId };
  } catch (error) {
    const message = error.message ?? 'Collection failed';
    logError({
      runId,
      sourceId: source.id,
      stage: error instanceof FetchRefused ? 'fetch' : 'parse',
      message,
      detail: error.code ?? null,
    });
    finishRun(runId, { ...stats, status: 'failed', errorCount: stats.errorCount + 1, startedAtMs: started });
    recordSyncResult(source.id, { status: 'failed', error: message });

    log.warn(`${source.name}: ${message}`);
    return { ...stats, status: 'failed', error: message, code: error.code ?? null, runId };
  }
};

/**
 * Collect several sources with a concurrency cap so we never open a dozen
 * connections at once.
 */
export const collectMany = async (sources, options = {}) => {
  const { concurrency = 4 } = options;
  const queue = [...sources];
  const results = [];

  const worker = async () => {
    while (queue.length > 0) {
      const source = queue.shift();
      if (!source) return;
      results.push(await collectSource(source, options));
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, worker));
  return results;
};
