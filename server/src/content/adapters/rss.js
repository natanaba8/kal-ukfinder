import { politeFetch } from '../fetcher.js';
import { looksLikeFeed, parseFeed } from '../../sources/rss.js';

/**
 * RSS/Atom adapter — the preferred collection method (pr.md §40).
 * Publishers put feeds up precisely so they can be read this way.
 */
export const rssAdapter = {
  method: 'RSS',

  endpoint: (source) => source.rssUrl ?? source.baseUrl,

  async collect(source, { limit = 15 } = {}) {
    const url = rssAdapter.endpoint(source);
    const response = await politeFetch(url, {
      accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
      headers: source.requestHeaders,
    });

    if (!looksLikeFeed(response.body)) {
      throw Object.assign(new Error('That URL did not return an RSS or Atom feed'), { code: 'NOT_A_FEED' });
    }

    const entries = parseFeed(response.body);

    return {
      method: 'RSS',
      endpoint: url,
      items: entries.slice(0, limit).map((entry) => ({
        title: entry.title,
        url: entry.url,
        summary: entry.summary,
        publishedAt: entry.publishedAt,
        imageUrl: entry.imageUrl,
        author: entry.author,
        categories: entry.categories,
      })),
      totalAvailable: entries.length,
    };
  },
};
