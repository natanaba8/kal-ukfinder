import { config } from '../config.js';
import { checkRobots } from './robots.js';

/**
 * The only way this codebase talks to a third-party site.
 *
 * Enforces, in order: robots.txt, a per-host minimum gap between requests, a
 * declared User-Agent, a timeout, and a response size ceiling. Everything the
 * content engine fetches goes through here so those guarantees hold whether the
 * caller is the scheduler, an admin pressing "Test", or auto-detection.
 */

const MAX_BYTES = 5 * 1024 * 1024;

/** host → timestamp of the last request, so we can space them out. */
const lastRequestAt = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class FetchRefused extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'FetchRefused';
    this.code = code;
  }
}

const throttle = async (host, crawlDelaySeconds) => {
  const gap = Math.max(config.ingest.politenessMs, (crawlDelaySeconds ?? 0) * 1000);
  const previous = lastRequestAt.get(host);

  if (previous) {
    const wait = previous + gap - Date.now();
    if (wait > 0) await sleep(wait);
  }

  lastRequestAt.set(host, Date.now());
};

/**
 * @param {string} url
 * @param {{headers?: Record<string,string>, timeoutMs?: number, accept?: string, skipRobots?: boolean}} options
 * @returns {Promise<{ok: true, status: number, body: string, contentType: string, finalUrl: string}>}
 */
export const politeFetch = async (url, options = {}) => {
  const { headers = {}, timeoutMs = 20_000, accept, skipRobots = false } = options;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchRefused('That is not a valid URL', 'INVALID_URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new FetchRefused('Only http and https URLs can be collected', 'UNSUPPORTED_PROTOCOL');
  }

  let crawlDelaySeconds = null;
  if (!skipRobots) {
    const robots = await checkRobots(url);
    if (!robots.allowed) throw new FetchRefused(robots.reason, 'ROBOTS_DISALLOWED');
    crawlDelaySeconds = robots.crawlDelaySeconds;
  }

  await throttle(parsed.host, crawlDelaySeconds);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'user-agent': config.ingest.userAgent,
        accept: accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-GB,en;q=0.9',
        ...headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
  } catch (error) {
    const reason =
      error.name === 'TimeoutError'
        ? `No response within ${Math.round(timeoutMs / 1000)} seconds`
        : `Could not reach the site (${error.cause?.code ?? error.name})`;
    throw new FetchRefused(reason, 'UNREACHABLE');
  }

  if (!response.ok) {
    throw new FetchRefused(
      response.status === 403 || response.status === 401
        ? `The site refused the request (HTTP ${response.status}) — it may block automated clients`
        : `The site returned HTTP ${response.status}`,
      `HTTP_${response.status}`,
    );
  }

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BYTES) {
    throw new FetchRefused('That page is too large to process', 'TOO_LARGE');
  }

  const body = await response.text();
  if (body.length > MAX_BYTES) {
    throw new FetchRefused('That page is too large to process', 'TOO_LARGE');
  }

  return {
    ok: true,
    status: response.status,
    body,
    contentType: response.headers.get('content-type') ?? '',
    finalUrl: response.url || url,
  };
};

/** Same guarantees, but for endpoints that return JSON. */
export const politeFetchJson = async (url, options = {}) => {
  const result = await politeFetch(url, { accept: 'application/json, text/plain, */*', ...options });

  try {
    return { ...result, json: JSON.parse(result.body) };
  } catch {
    throw new FetchRefused('That endpoint did not return valid JSON', 'INVALID_JSON');
  }
};

export const resetThrottle = () => lastRequestAt.clear();
