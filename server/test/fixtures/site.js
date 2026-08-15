import { createServer } from 'node:http';

/**
 * A tiny stand-in website so the content engine can be tested end to end
 * without touching the real internet: a feed, a job listing page, a JSON API,
 * a robots.txt, and a path that robots.txt disallows.
 */

const rssFeed = (items) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Policy Feed</title>
    <link>https://example.test</link>
    ${items
      .map(
        (item) => `<item>
      <title>${item.title}</title>
      <link>${item.link}</link>
      <description>${item.description}</description>
      <pubDate>${item.pubDate}</pubDate>
    </item>`,
      )
      .join('\n')}
  </channel>
</rss>`;

const FEED_ITEMS = [
  {
    title: 'Apprenticeship funding rules updated for 2026',
    link: 'https://example.test/policy/apprenticeship-funding',
    description: 'The department has updated apprenticeship funding bands from April, affecting new starts.',
    pubDate: 'Mon, 10 Aug 2026 09:00:00 GMT',
  },
  {
    title: 'Minimum wage rates confirmed',
    link: 'https://example.test/policy/minimum-wage',
    description: 'New National Living Wage rates take effect in April and apply to all workers aged 21 and over.',
    pubDate: 'Tue, 11 Aug 2026 09:00:00 GMT',
  },
  {
    title: 'Skills bootcamp places expanded',
    link: 'https://example.test/policy/bootcamps',
    description: 'Funded training places for adults changing career will increase across every English region.',
    pubDate: 'Wed, 12 Aug 2026 09:00:00 GMT',
  },
];

const JOBS_HTML = `<!doctype html>
<html><head><title>Vacancies</title></head>
<body>
  <main>
    <ul class="results">
      <li class="job-card">
        <h3 class="job-title"><a href="/jobs/staff-nurse">Staff Nurse — Acute Medicine</a></h3>
        <span class="company-name">Northern Care Trust</span>
        <span class="location">Leeds</span>
        <span class="deadline">14 March 2026</span>
        <p class="summary">Band 5 acute medicine post with a 12-month preceptorship.</p>
      </li>
      <li class="job-card">
        <h3 class="job-title"><a href="/jobs/data-analyst">Data Analyst</a></h3>
        <span class="company-name">Civic Insight</span>
        <span class="location">Manchester</span>
        <span class="deadline">28 February 2026</span>
        <p class="summary">SQL and Python essential. Hybrid working, two days in the office.</p>
      </li>
      <li class="job-card">
        <h3 class="job-title"><a href="/jobs/teaching-assistant">Teaching Assistant</a></h3>
        <span class="company-name">Brookfield Academy</span>
        <span class="location">Birmingham</span>
        <p class="summary">Support pupils with additional needs across Key Stage 2.</p>
      </li>
    </ul>
  </main>
</body></html>`;

const PAGE_WITH_FEED_LINK = `<!doctype html>
<html><head>
  <title>Example</title>
  <link rel="alternate" type="application/rss+xml" title="Example" href="/feed.xml" />
</head><body><h1>Example</h1></body></html>`;

const API_PAYLOAD = {
  results: [
    {
      title: 'Software Engineer',
      url: 'https://example.test/jobs/software-engineer',
      description: 'React and Node platform work.',
      employer: 'Meridian Digital',
      city: 'Bristol',
      publishedAt: '2026-08-12T09:00:00.000Z',
    },
    {
      title: 'Support Worker',
      url: 'https://example.test/jobs/support-worker',
      description: 'Community support role, driving licence preferred.',
      employer: 'Willow Court',
      city: 'Cardiff',
      publishedAt: '2026-08-11T09:00:00.000Z',
    },
  ],
};

const ROBOTS = `User-agent: *
Disallow: /private
Crawl-delay: 0

User-agent: EvilBot
Disallow: /
`;

/**
 * Starts the fixture site and resolves with its base URL and a close handle.
 *
 * `withFeed: false` serves no feed anywhere on the origin, which is how the
 * scraper-detection path gets exercised — with a feed present, detection is
 * supposed to prefer it (pr.md §40) and never reach the scraper.
 */
export const startFixtureSite = async ({ withFeed = true, withApi = true } = {}) => {
  let requestCount = 0;

  const server = createServer((request, response) => {
    requestCount += 1;
    const url = new URL(request.url, 'http://localhost');

    const send = (status, contentType, body) => {
      response.writeHead(status, { 'content-type': contentType });
      response.end(body);
    };

    if (!withFeed && /feed|rss|atom|index\.xml/.test(url.pathname)) {
      return send(404, 'text/plain', 'not found');
    }
    if (!withApi && url.pathname.startsWith('/api/')) {
      return send(404, 'text/plain', 'not found');
    }

    switch (url.pathname) {
      case '/robots.txt':
        return send(200, 'text/plain', ROBOTS);
      case '/feed.xml':
      case '/feed2.xml':
        return send(200, 'application/rss+xml', rssFeed(FEED_ITEMS));
      case '/feed-extra.xml':
        return send(
          200,
          'application/rss+xml',
          rssFeed([
            ...FEED_ITEMS,
            {
              title: 'Apprenticeship funding rules updated for 2026',
              link: 'https://other.test/policy/apprenticeships-copy',
              description: 'Syndicated copy of the same announcement from a different publisher.',
              pubDate: 'Mon, 10 Aug 2026 11:00:00 GMT',
            },
          ]),
        );
      case '/':
        return send(200, 'text/html', withFeed ? PAGE_WITH_FEED_LINK : '<html><body><h1>Example</h1></body></html>');
      case '/jobs':
        return send(200, 'text/html', JOBS_HTML);
      case '/api/jobs':
        return send(200, 'application/json', JSON.stringify(API_PAYLOAD));
      case '/private/jobs':
        return send(200, 'text/html', JOBS_HTML);
      case '/broken':
        return send(500, 'text/plain', 'server error');
      case '/not-a-feed':
        return send(200, 'text/html', '<html><body>Just a page</body></html>');
      default:
        return send(404, 'text/plain', 'not found');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    get requestCount() {
      return requestCount;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

export { FEED_ITEMS };
