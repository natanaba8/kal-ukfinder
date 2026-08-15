import { XMLParser } from 'fast-xml-parser';

import { createLogger } from '../logger.js';

const log = createLogger('rss');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  processEntities: true,
});

const USER_AGENT =
  'Kal-UKFinder/0.1 (+https://github.com/kal-ukfinder) news-aggregator; contact via app';

/** Feed values arrive as strings, `{ '#text': ... }` objects or arrays. Flatten them. */
const text = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === 'object') return text(value['#text'] ?? value['@_href'] ?? '');
  return '';
};

const arrayOf = (value) => (Array.isArray(value) ? value : value ? [value] : []);

export const stripHtml = (html) =>
  String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    // Feed furniture that adds nothing to a summary.
    .replace(/\s*(Continue reading\.{3}|Read more\.{3}|The post .+ appeared first on .+\.)\s*$/i, '')
    .trim();

const toIso = (value) => {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

/** Pull an image out of the many places feeds hide one. */
const imageFrom = (entry) => {
  const candidates = [
    entry['media:thumbnail'],
    entry['media:content'],
    entry.enclosure,
    entry['itunes:image'],
  ];
  for (const candidate of candidates) {
    for (const node of arrayOf(candidate)) {
      const url = node?.['@_url'] ?? node?.['@_href'] ?? text(node);
      if (url && /^https?:\/\//.test(url)) return url;
    }
  }
  const inline = /<img[^>]+src=["']([^"']+)["']/i.exec(
    text(entry['content:encoded']) || text(entry.description) || '',
  );
  return inline?.[1] ?? null;
};

const linkFrom = (entry) => {
  const raw = entry.link;
  if (typeof raw === 'string') return raw.trim();
  for (const node of arrayOf(raw)) {
    if (typeof node === 'string') return node.trim();
    const rel = node?.['@_rel'];
    if (!rel || rel === 'alternate') return text(node['@_href'] ?? node);
  }
  return text(entry.id) || text(entry.guid);
};

const normaliseEntry = (entry) => {
  const summarySource =
    entry.description ?? entry.summary ?? entry['content:encoded'] ?? entry.content ?? '';
  return {
    title: stripHtml(text(entry.title)),
    url: linkFrom(entry),
    summary: stripHtml(text(summarySource)).slice(0, 2000),
    publishedAt:
      toIso(entry.pubDate) ?? toIso(entry.published) ?? toIso(entry.updated) ?? toIso(entry['dc:date']),
    author: stripHtml(text(entry['dc:creator']) || text(entry.author?.name ?? entry.author)),
    imageUrl: imageFrom(entry),
    categories: arrayOf(entry.category)
      .map((category) => stripHtml(text(category['@_term'] ?? category)))
      .filter(Boolean)
      .slice(0, 8),
  };
};

/**
 * Parse RSS 2.0, Atom or RDF markup into normalised entries.
 * Split out from `fetchFeed` so the content engine can parse a body it fetched
 * through the polite fetcher (robots.txt, throttling) rather than fetching here.
 */
export const parseFeed = (xml) => {
  const parsed = parser.parse(xml);
  const entries = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? parsed?.['rdf:RDF']?.item ?? [];

  return arrayOf(entries)
    .map(normaliseEntry)
    .filter((entry) => entry.title && /^https?:\/\//.test(entry.url ?? ''));
};

/** True when a document looks like a feed rather than a web page. */
export const looksLikeFeed = (xml) => /<(rss|feed|rdf:RDF)[\s>]/i.test(xml.slice(0, 2000));

/**
 * Fetch and parse an RSS 2.0 or Atom feed.
 * Never throws — a dead source must not take the whole ingest run down.
 */
export const fetchFeed = async (url, { timeoutMs = 15000 } = {}) => {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });

    if (!response.ok) {
      log.warn(`${url} -> HTTP ${response.status}`);
      return [];
    }

    return parseFeed(await response.text());
  } catch (error) {
    log.warn(`${url} -> ${error.name}: ${error.message}`);
    return [];
  }
};
