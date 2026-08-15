import * as cheerio from 'cheerio';

import { SELECTOR_FIELDS } from '../../store/sources.js';
import { stripHtml } from '../../sources/rss.js';
import { politeFetch } from '../fetcher.js';

/**
 * Generic HTML adapter driven entirely by the selectors stored on the source
 * (pr.md §8, §10, §42.8) — there is no per-website code anywhere in this
 * project, so an admin can add a site from the panel without a deploy.
 *
 * Only ever used when no feed or API was found, per §40's preference order.
 */

const absolute = (href, base) => {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
};

/** `.title` reads text; `.link@href` or `img@src` reads an attribute. */
const readSelector = ($element, $, selector, baseUrl) => {
  if (!selector) return null;

  const [rawPath, attribute] = selector.split('@').map((part) => part.trim());
  const target = rawPath ? $element.find(rawPath).first() : $element;
  if (target.length === 0) return null;

  if (attribute) {
    const value = target.attr(attribute);
    return value ? value.trim() : null;
  }

  const text = stripHtml(target.text());
  return text || null;
};

const parseDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

  // "Closing date: 14 March 2026" and similar prose.
  const match = /(\d{1,2})[\s/-]([A-Za-z]{3,}|\d{1,2})[\s/-](\d{4})/.exec(value);
  if (match) {
    const retry = new Date(`${match[1]} ${match[2]} ${match[3]}`);
    if (!Number.isNaN(retry.getTime())) return retry.toISOString();
  }

  return null;
};

export const scraperAdapter = {
  method: 'SCRAPER',

  endpoint: (source) => source.scrapeUrl ?? source.baseUrl,

  async collect(source, { limit = 15 } = {}) {
    const url = scraperAdapter.endpoint(source);
    const selectors = source.selectors ?? {};

    if (!selectors.item) {
      throw Object.assign(new Error('This source has no list selector configured'), { code: 'NO_SELECTORS' });
    }

    const response = await politeFetch(url, { headers: source.requestHeaders });
    const $ = cheerio.load(response.body);
    const elements = $(selectors.item);

    if (elements.length === 0) {
      throw Object.assign(
        new Error(`The list selector "${selectors.item}" matched nothing on the page`),
        { code: 'SELECTOR_NO_MATCH' },
      );
    }

    /** Per-field hit counts drive the admin's "Test Extraction" panel (§10). */
    const fieldHits = Object.fromEntries(SELECTOR_FIELDS.map((field) => [field, 0]));
    const items = [];

    elements.each((index, element) => {
      if (items.length >= limit) return false;

      const $element = $(element);
      const record = {};

      for (const field of SELECTOR_FIELDS) {
        if (field === 'item') continue;
        const value = readSelector($element, $, selectors[field], response.finalUrl);
        if (value) {
          record[field] = value;
          fieldHits[field] += 1;
        }
      }

      // The link is the identity of the record — without one there is nothing
      // to deduplicate against and nowhere to send the reader.
      const href =
        readSelector($element, $, selectors.url ?? 'a@href', response.finalUrl) ??
        $element.find('a').first().attr('href');
      const link = absolute(href, response.finalUrl);
      if (!link || !record.title) return undefined;

      fieldHits.item += 1;

      items.push({
        title: record.title,
        url: link,
        summary: record.description ?? '',
        publishedAt: parseDate(record.date),
        imageUrl: absolute(record.image, response.finalUrl),
        author: null,
        categories: record.category ? [record.category] : [],
        organization: record.organization ?? null,
        location: record.location ?? null,
        deadline: parseDate(record.deadline),
        salaryText: record.salary ?? null,
      });

      return undefined;
    });

    if (items.length === 0) {
      throw Object.assign(
        new Error(`Found ${elements.length} matching elements, but none had both a title and a link`),
        { code: 'NO_USABLE_ITEMS' },
      );
    }

    return {
      method: 'SCRAPER',
      endpoint: url,
      items,
      totalAvailable: elements.length,
      fieldHits,
      matchedElements: elements.length,
    };
  },
};
