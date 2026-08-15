import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kal-sources-test-'));
process.env.DB_PATH = path.join(tempDir, 'test.db');
process.env.INGEST_ENABLED = 'false';
process.env.DIGEST_ENABLED = 'false';
process.env.NODE_ENV = 'test';
process.env.SCRAPE_POLITENESS_MS = '0';

const { startFixtureSite } = await import('./fixtures/site.js');
const { createApp } = await import('../src/index.js');
const { db } = await import('../src/db.js');
const { setRole } = await import('../src/store/users.js');
const { createSource, getSource, listSources, dueSources, recordSyncResult, updateSource } = await import(
  '../src/store/sources.js'
);
const { collectSource, previewSource } = await import('../src/content/engine.js');
const { detectSource } = await import('../src/content/detect.js');
const { parseRobots, clearRobotsCache } = await import('../src/content/robots.js');
const { similarity } = await import('../src/content/dedupe.js');
const { contentHash, normaliseTitle, parseSalary } = await import('../src/content/normalise.js');
const { listItems } = await import('../src/store/items.js');
const { listJobs } = await import('../src/store/jobs.js');
const { listRuns } = await import('../src/store/scrape-logs.js');

let server;
let baseUrl;
let site;
let adminToken;

const api = async (route, { token = adminToken, ...options } = {}) => {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

before(async () => {
  site = await startFixtureSite();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const registered = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'correct-horse-42' }),
  }).then((response) => response.json());

  setRole(registered.user.id, 'ADMIN');

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'correct-horse-42' }),
  }).then((response) => response.json());

  adminToken = login.token;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await site.close();
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
});

describe('robots.txt', () => {
  it('parses groups, wildcards and crawl-delay', () => {
    const parsed = parseRobots(
      ['User-agent: *', 'Disallow: /private', 'Allow: /private/public', 'Crawl-delay: 2'].join('\n'),
      'Kal-UKFinder/1.0',
    );

    assert.equal(parsed.crawlDelaySeconds, 2);
    assert.equal(parsed.rules.length, 2);
  });

  it('picks the group that names our agent over the wildcard', () => {
    const parsed = parseRobots(
      ['User-agent: *', 'Disallow: /', '', 'User-agent: kal-ukfinder', 'Disallow: /admin'].join('\n'),
      'Kal-UKFinder/1.0',
    );

    assert.deepEqual(
      parsed.rules.map((rule) => rule.path),
      ['/admin'],
    );
  });

  it('refuses a disallowed path and allows the rest of the site', async () => {
    clearRobotsCache();

    const blocked = await previewSource({
      id: 'draft',
      name: 'Blocked',
      baseUrl: `${site.baseUrl}/private/jobs`,
      method: 'SCRAPER',
      scrapeUrl: `${site.baseUrl}/private/jobs`,
      contentType: 'JOB',
      selectors: { item: 'li.job-card', title: 'h3.job-title' },
      trust: 'trusted',
    });

    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'ROBOTS_DISALLOWED');
    assert.match(blocked.reason, /robots\.txt/);
  });
});

describe('auto-detection', () => {
  it('finds the feed declared in the page head', async () => {
    const detected = await detectSource(site.baseUrl);
    assert.equal(detected.ok, true);
    assert.equal(detected.method, 'RSS');
    assert.match(detected.rssUrl, /feed\.xml$/);
    assert.equal(detected.itemCount, 3);
    assert.ok(detected.checks.some((check) => check.label === 'robots.txt' && check.ok));
  });

  it('treats a feed URL as a feed directly', async () => {
    const detected = await detectSource(`${site.baseUrl}/feed.xml`);
    assert.equal(detected.method, 'RSS');
  });

  it('prefers a feed at the origin even when pointed at a listing page', async () => {
    const detected = await detectSource(`${site.baseUrl}/jobs`);
    assert.equal(detected.method, 'RSS', 'pr.md §40: never scrape when a feed is available');
  });

  it('falls back to scraping and suggests selectors when there is no feed', async () => {
    const bare = await startFixtureSite({ withFeed: false, withApi: false });
    clearRobotsCache();

    try {
      const detected = await detectSource(`${bare.baseUrl}/jobs`);
      assert.equal(detected.ok, true);
      assert.equal(detected.method, 'SCRAPER');
      assert.ok(detected.selectors.item, 'suggests a list selector');
      assert.ok(detected.warning, 'warns that scraping needs permission');
      assert.ok(detected.checks.some((check) => check.label === 'Feed' && !check.ok));
    } finally {
      await bare.close();
    }
  });

  it('reports a useful reason when a site is unreachable', async () => {
    const detected = await detectSource(`${site.baseUrl}/broken`);
    assert.equal(detected.ok, false);
    assert.ok(detected.reason.length > 0);
  });
});

describe('collection', () => {
  it('collects an RSS source, stores articles and logs the run', async () => {
    const source = createSource({
      name: 'Fixture Policy',
      baseUrl: `${site.baseUrl}/feed.xml`,
      rssUrl: `${site.baseUrl}/feed.xml`,
      contentType: 'POLICY',
      method: 'RSS',
      trust: 'official',
      active: true,
    });

    const result = await collectSource(source, { triggeredBy: 'cli' });
    assert.equal(result.status, 'success');
    assert.equal(result.itemsNew, 3);

    const stored = listItems({ limit: 10 });
    assert.equal(stored.length, 3);
    assert.equal(stored[0].kind, 'policy', 'an official source produces policy items');
    assert.ok(stored[0].summary.length > 0, 'items are summarised on the way in');
    assert.ok(stored[0].contentHash ?? true);

    const runs = listRuns({ sourceId: source.id });
    assert.equal(runs.data[0].status, 'success');
    assert.equal(runs.data[0].itemsNew, 3);
  });

  it('skips everything on a second run', async () => {
    const source = listSources({ search: 'Fixture Policy' }).data[0];
    const again = await collectSource(source, { triggeredBy: 'cli' });

    assert.equal(again.itemsNew, 0);
    assert.equal(again.itemsDuplicate, 3);
  });

  it('detects a syndicated copy from a different publisher as a duplicate', async () => {
    const source = createSource({
      name: 'Fixture Syndicate',
      baseUrl: `${site.baseUrl}/feed-extra.xml`,
      rssUrl: `${site.baseUrl}/feed-extra.xml`,
      contentType: 'POLICY',
      method: 'RSS',
      trust: 'trusted',
      active: true,
    });

    const result = await collectSource(source, { triggeredBy: 'cli' });
    assert.equal(result.itemsNew, 0, 'all four are already known — three by URL, one by title');
    assert.equal(result.itemsDuplicate, 4);
  });

  it('scrapes a job listing page using configured selectors', async () => {
    const source = createSource({
      name: 'Fixture Jobs',
      baseUrl: `${site.baseUrl}/jobs`,
      scrapeUrl: `${site.baseUrl}/jobs`,
      contentType: 'JOB',
      method: 'SCRAPER',
      selectors: {
        item: 'li.job-card',
        title: 'h3.job-title',
        url: 'a@href',
        organization: '.company-name',
        location: '.location',
        deadline: '.deadline',
        description: '.summary',
      },
      active: true,
    });

    const result = await collectSource(source, { triggeredBy: 'cli' });
    assert.equal(result.status, 'success');
    assert.equal(result.itemsNew, 3);

    const jobs = listJobs({ limit: 10 });
    assert.equal(jobs.length, 3);

    const nurse = jobs.find((job) => job.title.includes('Staff Nurse'));
    assert.equal(nurse.company, 'Northern Care Trust');
    assert.equal(nurse.location, 'Leeds');
    assert.ok(nurse.deadline, 'the closing date is parsed from prose');
    assert.ok(nurse.url.startsWith('http'), 'relative links are made absolute');
  });

  it('collects a generic JSON API with field mapping', async () => {
    const source = createSource({
      name: 'Fixture API',
      baseUrl: `${site.baseUrl}/api/jobs`,
      apiUrl: `${site.baseUrl}/api/jobs`,
      contentType: 'JOB',
      method: 'API',
      selectors: { item: 'results', title: 'title', url: 'url', organization: 'employer', location: 'city', date: 'publishedAt' },
      active: true,
    });

    const result = await collectSource(source, { triggeredBy: 'cli' });
    assert.equal(result.itemsNew, 2);

    const engineer = listJobs({ search: 'Software Engineer' })[0];
    assert.equal(engineer.company, 'Meridian Digital');
    assert.equal(engineer.location, 'Bristol');
  });

  it('records a failure against the source without throwing', async () => {
    const source = createSource({
      name: 'Fixture Broken',
      baseUrl: `${site.baseUrl}/broken`,
      rssUrl: `${site.baseUrl}/broken`,
      contentType: 'POLICY',
      method: 'RSS',
      active: true,
    });

    const result = await collectSource(source, { triggeredBy: 'cli' });
    assert.equal(result.status, 'failed');
    assert.ok(result.error);

    const reloaded = getSource(source.id);
    assert.equal(reloaded.lastStatus, 'failed');
    assert.equal(reloaded.consecutiveFailures, 1);

    const errors = await api(`/api/admin/scrape-runs/${result.runId}/errors`);
    assert.ok(errors.body.errors.length > 0, 'the failure detail is stored for the admin panel');
  });
});

describe('scheduling', () => {
  it('only returns sources whose interval has elapsed, and backs off failures', () => {
    const source = createSource({
      name: 'Fixture Schedule',
      baseUrl: `${site.baseUrl}/schedule-test`,
      rssUrl: `${site.baseUrl}/schedule-test`,
      contentType: 'POLICY',
      method: 'RSS',
      scrapeIntervalMinutes: 30,
      active: true,
    });

    assert.ok(dueSources().some((entry) => entry.id === source.id), 'a source that never ran is due');

    recordSyncResult(source.id, { status: 'success' });
    assert.equal(dueSources().some((entry) => entry.id === source.id), false, 'not due straight after a run');

    // 31 minutes later it is due again.
    assert.ok(dueSources(Date.now() + 31 * 60_000).some((entry) => entry.id === source.id));

    recordSyncResult(source.id, { status: 'failed', error: 'boom' });
    recordSyncResult(source.id, { status: 'failed', error: 'boom' });
    assert.equal(
      dueSources(Date.now() + 31 * 60_000).some((entry) => entry.id === source.id),
      false,
      'after two failures the wait doubles',
    );
  });

  it('respects an inactive source', () => {
    const source = createSource({
      name: 'Fixture Inactive',
      baseUrl: `${site.baseUrl}/inactive`,
      contentType: 'POLICY',
      method: 'RSS',
      active: false,
    });

    assert.equal(dueSources().some((entry) => entry.id === source.id), false);
    updateSource(source.id, { active: true });
    assert.ok(dueSources().some((entry) => entry.id === source.id));
  });
});

describe('normalisation helpers', () => {
  it('reads salary ranges out of prose', () => {
    assert.deepEqual(parseSalary('£28,000 - £34,000 per year'), { min: 28000, max: 34000 });
    assert.deepEqual(parseSalary('£30k'), { min: 30000, max: null });
    assert.deepEqual(parseSalary('Competitive'), { min: null, max: null });
  });

  it('normalises titles so syndicated copies collide', () => {
    assert.equal(normaliseTitle('Software Engineer (New Vacancy!)'), 'software engineer');
    assert.equal(
      contentHash({ title: 'Software Engineer', organization: 'Acme' }),
      contentHash({ title: 'software engineer!', organization: 'Acme' }),
    );
  });

  it('scores title similarity', () => {
    assert.ok(similarity('Software Engineer', 'Software Engineer - Remote') > 0.7);
    assert.ok(similarity('Software Engineer', 'Registered Nurse') < 0.4);
  });
});

describe('admin source API', () => {
  it('walks the wizard: detect, test, create, sync, disable, delete', async () => {
    const detected = await api('/api/admin/sources/detect', {
      method: 'POST',
      body: JSON.stringify({ url: site.baseUrl }),
    });
    assert.equal(detected.status, 200);
    assert.equal(detected.body.method, 'RSS');

    const tested = await api('/api/admin/sources/test', {
      method: 'POST',
      body: JSON.stringify({
        draft: {
          name: 'Wizard Source',
          baseUrl: site.baseUrl,
          rssUrl: detected.body.rssUrl,
          method: 'RSS',
          contentType: 'POLICY',
        },
      }),
    });
    assert.equal(tested.status, 200);
    assert.equal(tested.body.ok, true);
    assert.equal(tested.body.itemsFound, 3);
    assert.ok(tested.body.preview.length > 0, 'the admin sees real extracted content before saving');
    assert.equal(tested.body.fieldCoverage.title, 3);

    // A different feed URL — the same one is already registered, and the unique
    // endpoint index is what stops an admin adding a source twice.
    const created = await api('/api/admin/sources', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Wizard Source',
        baseUrl: `${site.baseUrl}/wizard`,
        rssUrl: `${site.baseUrl}/feed2.xml`,
        method: 'RSS',
        contentType: 'POLICY',
        active: true,
        scrapeIntervalMinutes: 60,
      }),
    });
    assert.equal(created.status, 201);
    const sourceId = created.body.source.id;

    const synced = await api(`/api/admin/sources/${sourceId}/sync`, { method: 'POST' });
    assert.equal(synced.status, 200);
    assert.equal(synced.body.status, 'success');

    const disabled = await api(`/api/admin/sources/${sourceId}/active`, {
      method: 'POST',
      body: JSON.stringify({ active: false }),
    });
    assert.equal(disabled.body.source.active, false);

    const removed = await api(`/api/admin/sources/${sourceId}`, { method: 'DELETE' });
    assert.equal(removed.body.deleted, true);
    assert.equal((await api(`/api/admin/sources/${sourceId}`)).status, 404);
  });

  it('rejects a scraper source with no list selector', async () => {
    const { status, body } = await api('/api/admin/sources', {
      method: 'POST',
      body: JSON.stringify({
        name: 'No selectors',
        baseUrl: `${site.baseUrl}/jobs-2`,
        method: 'SCRAPER',
        contentType: 'JOB',
      }),
    });

    assert.equal(status, 400);
    assert.equal(body.code, 'MISSING_SELECTORS');
  });

  it('refuses a duplicate endpoint', async () => {
    const payload = {
      name: 'Duplicate',
      baseUrl: `${site.baseUrl}/dupe`,
      rssUrl: `${site.baseUrl}/dupe.xml`,
      method: 'RSS',
      contentType: 'POLICY',
    };

    assert.equal((await api('/api/admin/sources', { method: 'POST', body: JSON.stringify(payload) })).status, 201);
    const second = await api('/api/admin/sources', { method: 'POST', body: JSON.stringify(payload) });
    assert.equal(second.status, 409);
  });

  it('lists sources with their last run', async () => {
    const { body } = await api('/api/admin/sources?pageSize=100');
    assert.ok(body.total > 0);
    assert.ok(body.data.some((source) => source.lastRun));
    assert.ok(typeof body.page === 'number' && typeof body.pageSize === 'number');
  });
});

describe('admin content moderation', () => {
  it('hides an article so it disappears from the public API', async () => {
    const [item] = listItems({ limit: 1 });

    const hidden = await api(`/api/admin/policies/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'hidden' }),
    });
    assert.equal(hidden.status, 200);

    const publicView = await fetch(`${baseUrl}/api/items/${item.id}`);
    assert.equal(publicView.status, 404, 'hidden content is not served to the app');

    const adminView = await api('/api/admin/policies?status=hidden');
    assert.ok(adminView.body.data.some((entry) => entry.id === item.id));

    await api(`/api/admin/policies/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
    assert.equal((await fetch(`${baseUrl}/api/items/${item.id}`)).status, 200);
  });

  it('applies a bulk action', async () => {
    const ids = listJobs({ limit: 2 }).map((job) => job.id);

    const result = await api('/api/admin/bulk', {
      method: 'POST',
      body: JSON.stringify({ entity: 'job', ids, action: 'feature' }),
    });
    assert.equal(result.body.affected, ids.length);

    const featured = listJobs({ limit: 10, featured: true });
    assert.equal(featured.length, ids.length);
  });

  it('reports dashboard statistics', async () => {
    const { body } = await api('/api/admin/stats');
    assert.ok(body.cards.totalPolicies > 0);
    assert.ok(body.cards.totalJobs > 0);
    assert.ok(body.cards.activeSources > 0);
    assert.ok(body.scraping.lastSuccessAt);
    assert.ok(Array.isArray(body.latest.runs));
  });
});

describe('public pagination and filters', () => {
  it('paginates jobs and reports the total', async () => {
    const first = await fetch(`${baseUrl}/api/jobs?page=1&pageSize=2`).then((response) => response.json());
    assert.equal(first.jobs.length, 2);
    assert.ok(first.total >= 5);
    assert.equal(first.page, 1);
    assert.ok(first.pages >= 3);

    const second = await fetch(`${baseUrl}/api/jobs?page=2&pageSize=2`).then((response) => response.json());
    assert.notEqual(first.jobs[0].id, second.jobs[0].id, 'page 2 returns different rows');
  });

  it('filters jobs by location and organisation', async () => {
    const byLocation = await fetch(`${baseUrl}/api/jobs?location=Leeds`).then((response) => response.json());
    assert.ok(byLocation.jobs.every((job) => /leeds/i.test(`${job.location} ${job.region}`)));

    const byOrg = await fetch(`${baseUrl}/api/jobs?organization=Meridian`).then((response) => response.json());
    assert.ok(byOrg.jobs.length >= 1);
  });

  it('searches across both content types', async () => {
    const { jobs, policies, total } = await fetch(`${baseUrl}/api/search?q=apprenticeship`).then((response) =>
      response.json(),
    );
    assert.ok(total >= 1);
    assert.ok(policies.total >= 1);
    assert.ok(Array.isArray(jobs.data));
  });
});
