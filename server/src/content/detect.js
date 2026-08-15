import * as cheerio from 'cheerio';

import { createLogger } from '../logger.js';
import { looksLikeFeed, parseFeed } from '../sources/rss.js';
import { FetchRefused, politeFetch } from './fetcher.js';
import { checkRobots } from './robots.js';

const log = createLogger('detect');

/**
 * Automatic source detection (pr.md §9).
 *
 * Order is deliberate and matches §40: a declared feed, then a conventional
 * feed path, then a JSON API, and only then a scraper — with suggested
 * selectors so a non-technical admin has something that works to start from.
 */

const FEED_PATHS = ['/feed', '/rss', '/rss.xml', '/feed.xml', '/atom.xml', '/index.xml', '/feeds/posts/default'];
const API_PATHS = ['/wp-json/wp/v2/posts', '/api/jobs', '/api/vacancies', '/api/posts', '/api/articles'];

const tryFeed = async (url) => {
  try {
    const response = await politeFetch(url, {
      accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5',
      timeoutMs: 12_000,
    });
    if (!looksLikeFeed(response.body)) return null;

    const entries = parseFeed(response.body);
    if (entries.length === 0) return null;

    return { url: response.finalUrl, itemCount: entries.length, sample: entries.slice(0, 3) };
  } catch {
    return null;
  }
};

const tryJsonApi = async (url) => {
  try {
    const response = await politeFetch(url, { accept: 'application/json', timeoutMs: 12_000 });
    if (!response.contentType.includes('json')) return null;

    const payload = JSON.parse(response.body);
    const rows = Array.isArray(payload)
      ? payload
      : ['results', 'data', 'items', 'jobs', 'posts'].map((key) => payload?.[key]).find(Array.isArray);

    if (!Array.isArray(rows) || rows.length === 0) return null;

    return {
      url: response.finalUrl,
      itemCount: rows.length,
      listPath: Array.isArray(payload)
        ? null
        : ['results', 'data', 'items', 'jobs', 'posts'].find((key) => Array.isArray(payload?.[key])),
      sampleKeys: Object.keys(rows[0] ?? {}).slice(0, 20),
    };
  } catch {
    return null;
  }
};

/**
 * Guess list selectors by finding the deepest repeated sibling structure whose
 * members each contain a link and some text. Crude, but it gets an admin to a
 * working configuration they can refine, which is the point of §10.
 */
/** `CSS.escape` is a browser API — escape class names for a selector ourselves. */
const escapeClassName = (className) => className.replace(/([^a-zA-Z0-9_-])/g, '\\$1');

export const suggestSelectors = (html, baseUrl) => {
  const $ = cheerio.load(html);
  const candidates = new Map();

  $('a[href]').each((index, anchor) => {
    const $anchor = $(anchor);
    const parent = $anchor.parent();
    if (parent.length === 0) return;

    // Describe the repeating unit by its tag and first class.
    const container = parent.closest('li, article, .card, [class*="job"], [class*="item"], [class*="result"], div');
    if (container.length === 0) return;

    const tag = container.get(0)?.tagName;
    const className = (container.attr('class') ?? '').split(/\s+/).filter(Boolean)[0];
    if (!tag) return;

    const selector = className ? `${tag}.${escapeClassName(className)}` : tag;
    candidates.set(selector, (candidates.get(selector) ?? 0) + 1);
  });

  const ranked = [...candidates.entries()]
    .filter(([selector, count]) => count >= 3 && !/^(body|html|main|div)$/.test(selector))
    .sort((a, b) => b[1] - a[1]);

  const best = ranked[0];
  if (!best) return null;

  const [itemSelector, count] = best;
  const $first = $(itemSelector).first();

  const findFirst = (patterns) => {
    for (const pattern of patterns) {
      if ($first.find(pattern).length > 0) return pattern;
    }
    return undefined;
  };

  return {
    matched: count,
    selectors: {
      item: itemSelector,
      title: findFirst(['h1', 'h2', 'h3', 'h4', '[class*="title"]', 'a']) ?? 'a',
      url: 'a@href',
      description: findFirst(['p', '[class*="summary"]', '[class*="description"]', '[class*="excerpt"]']),
      date: findFirst(['time', '[datetime]', '[class*="date"]', '[class*="posted"]']),
      organization: findFirst(['[class*="company"]', '[class*="employer"]', '[class*="organisation"]']),
      location: findFirst(['[class*="location"]', '[class*="place"]']),
      deadline: findFirst(['[class*="deadline"]', '[class*="closing"]']),
      image: findFirst(['img@src']),
    },
  };
};

/**
 * Inspect a URL and work out how it should be collected.
 *
 * @returns {Promise<{method: string, ...}>} never throws for a reachable site —
 *   detection failures are reported as data so the admin panel can show them.
 */
export const detectSource = async (rawUrl) => {
  let target;
  try {
    target = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
  } catch {
    return { ok: false, method: null, reason: 'That is not a valid website address' };
  }

  const robots = await checkRobots(target.toString());
  if (!robots.allowed) {
    return {
      ok: false,
      method: null,
      reason: robots.reason,
      code: 'ROBOTS_DISALLOWED',
      checks: [{ label: 'robots.txt', ok: false, detail: robots.reason }],
    };
  }

  const checks = [{ label: 'robots.txt', ok: true, detail: 'Automated access is permitted' }];

  // 1. The URL might itself be a feed.
  const direct = await tryFeed(target.toString());
  if (direct) {
    checks.push({ label: 'Feed', ok: true, detail: `This URL is a feed with ${direct.itemCount} items` });
    return { ok: true, method: 'RSS', rssUrl: direct.url, itemCount: direct.itemCount, checks, sample: direct.sample };
  }

  // 2. Fetch the page and look for a declared feed.
  let page;
  try {
    page = await politeFetch(target.toString());
    checks.push({ label: 'Website', ok: true, detail: `Reachable (HTTP ${page.status})` });
  } catch (error) {
    return {
      ok: false,
      method: null,
      reason: error instanceof FetchRefused ? error.message : 'Could not reach that website',
      code: error.code ?? 'UNREACHABLE',
      checks: [...checks, { label: 'Website', ok: false, detail: error.message }],
    };
  }

  const $ = cheerio.load(page.body);
  const declared = $('link[rel="alternate"]')
    .filter((index, element) => /rss|atom|xml/i.test($(element).attr('type') ?? ''))
    .map((index, element) => $(element).attr('href'))
    .get()
    .map((href) => {
      try {
        return new URL(href, page.finalUrl).toString();
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  for (const candidate of declared) {
    const feed = await tryFeed(candidate);
    if (feed) {
      checks.push({ label: 'Feed', ok: true, detail: `Declared in the page head — ${feed.itemCount} items` });
      return { ok: true, method: 'RSS', rssUrl: feed.url, itemCount: feed.itemCount, checks, sample: feed.sample };
    }
  }

  // 3. Conventional feed paths.
  for (const suffix of FEED_PATHS) {
    const feed = await tryFeed(new URL(suffix, target.origin).toString());
    if (feed) {
      checks.push({ label: 'Feed', ok: true, detail: `Found at ${suffix} — ${feed.itemCount} items` });
      return { ok: true, method: 'RSS', rssUrl: feed.url, itemCount: feed.itemCount, checks, sample: feed.sample };
    }
  }
  checks.push({ label: 'Feed', ok: false, detail: 'No RSS or Atom feed found' });

  // 4. A JSON API.
  for (const suffix of API_PATHS) {
    const api = await tryJsonApi(new URL(suffix, target.origin).toString());
    if (api) {
      checks.push({ label: 'API', ok: true, detail: `JSON endpoint at ${suffix} — ${api.itemCount} records` });
      return {
        ok: true,
        method: 'API',
        apiUrl: api.url,
        itemCount: api.itemCount,
        selectors: { item: api.listPath ?? undefined },
        availableFields: api.sampleKeys,
        checks,
      };
    }
  }
  checks.push({ label: 'API', ok: false, detail: 'No public JSON endpoint found' });

  // 5. Fall back to scraping, with suggested selectors.
  const suggestion = suggestSelectors(page.body, page.finalUrl);
  if (suggestion) {
    checks.push({
      label: 'Page structure',
      ok: true,
      detail: `${suggestion.matched} repeating entries detected — selectors suggested`,
    });
    return {
      ok: true,
      method: 'SCRAPER',
      scrapeUrl: page.finalUrl,
      selectors: suggestion.selectors,
      itemCount: suggestion.matched,
      checks,
      warning:
        'No feed or API is available, so this source would be scraped. Check the site’s terms of service allow it before activating.',
    };
  }

  checks.push({ label: 'Page structure', ok: false, detail: 'No repeating list of entries found' });
  log.warn(`no collection method detected for ${target.host}`);

  return {
    ok: false,
    method: null,
    reason: 'No feed, API or repeating list of entries could be found on that page',
    code: 'NOT_DETECTED',
    checks,
  };
};
