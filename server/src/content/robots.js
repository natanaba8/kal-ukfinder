import { config } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('robots');

/**
 * Minimal robots.txt support (pr.md §13, §40).
 *
 * Implements the parts that actually govern a polite aggregator: User-agent
 * grouping, Allow/Disallow with `*` and `$` wildcards, longest-match-wins
 * precedence, and Crawl-delay. Sitemap and other directives are ignored.
 *
 * Fail-open on a network error, fail-closed on an explicit Disallow — a site
 * that is briefly down should not permanently disable a source, but a site that
 * says no means no.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

const patternToRegex = (pattern) => {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  return new RegExp(`^${escaped.endsWith('$') ? `${escaped.slice(0, -1)}$` : escaped}`);
};

export const parseRobots = (text, userAgent) => {
  const agent = userAgent.toLowerCase();
  const groups = [];
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      // A blank line ends a group; consecutive user-agent lines share one.
      if (!current || current.rules.length > 0 || current.crawlDelay !== null) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;

    if (field === 'disallow' || field === 'allow') {
      // "Disallow:" with no value means allow everything.
      if (field === 'disallow' && value === '') continue;
      current.rules.push({ allow: field === 'allow', path: value });
    } else if (field === 'crawl-delay') {
      const delay = Number.parseFloat(value);
      if (Number.isFinite(delay)) current.crawlDelay = delay;
    }
  }

  const matching =
    groups.find((group) => group.agents.some((entry) => entry !== '*' && agent.includes(entry))) ??
    groups.find((group) => group.agents.includes('*'));

  return {
    rules: matching?.rules ?? [],
    crawlDelaySeconds: matching?.crawlDelay ?? null,
  };
};

const isAllowedBy = (rules, pathname) => {
  let decision = { allow: true, length: -1 };

  for (const rule of rules) {
    if (!patternToRegex(rule.path).test(pathname)) continue;
    // Longest matching pattern wins; Allow beats Disallow at equal length.
    if (rule.path.length > decision.length || (rule.path.length === decision.length && rule.allow)) {
      decision = { allow: rule.allow, length: rule.path.length };
    }
  }

  return decision.allow;
};

const loadRobots = async (origin) => {
  const cached = cache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.value;

  let value = { rules: [], crawlDelaySeconds: null, reachable: false };

  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': config.ingest.userAgent },
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });

    if (response.ok) {
      value = { ...parseRobots(await response.text(), config.ingest.userAgent), reachable: true };
    } else if (response.status === 404) {
      // No robots.txt means no restrictions.
      value = { rules: [], crawlDelaySeconds: null, reachable: true };
    }
  } catch (error) {
    log.warn(`${origin}/robots.txt unreachable (${error.name}) — proceeding`);
  }

  cache.set(origin, { fetchedAt: Date.now(), value });
  return value;
};

/**
 * @returns {Promise<{allowed: boolean, crawlDelaySeconds: number|null, reason: string|null}>}
 */
export const checkRobots = async (url) => {
  if (!config.ingest.respectRobots) {
    return { allowed: true, crawlDelaySeconds: null, reason: null };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, crawlDelaySeconds: null, reason: 'That is not a valid URL' };
  }

  const robots = await loadRobots(parsed.origin);
  const allowed = isAllowedBy(robots.rules, `${parsed.pathname}${parsed.search}`);

  return {
    allowed,
    crawlDelaySeconds: robots.crawlDelaySeconds,
    reason: allowed ? null : `${parsed.host}/robots.txt disallows ${parsed.pathname} for automated clients`,
  };
};

export const clearRobotsCache = () => cache.clear();
