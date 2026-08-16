import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { isolateDatabase } from './support/isolate.js';

// Isolate the test database before anything imports ./src/db.js.
const tempDir = isolateDatabase('api');

const { createApp } = await import('../src/index.js');
const { db } = await import('../src/db.js');
const { cvHeuristics } = await import('../src/ai/cv-heuristics.js');
const { insertItem, idForUrl, rankedForProfile } = await import('../src/store/items.js');
const { upsertJob, listJobs } = await import('../src/store/jobs.js');
const { scoreJobLexically } = await import('../src/ai/coach.js');

let server;
let baseUrl;

const api = async (route, options) => {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options?.headers ?? {}) },
  });
  return { status: response.status, body: await response.json() };
};

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await insertItem({
    id: idForUrl('https://example.gov.uk/apprenticeship-reform'),
    kind: 'policy',
    sourceId: 'govuk-dfe',
    sourceName: 'Dept for Education',
    sourceTrust: 'official',
    title: 'Apprenticeship funding rules updated for 2026',
    url: 'https://example.gov.uk/apprenticeship-reform',
    publishedAt: new Date().toISOString(),
    rawSummary: 'The department has updated the funding rules for apprenticeships.',
    headline: 'Apprenticeship funding rules updated',
    bullets: ['Funding bands change from April.', 'Employers keep the levy transfer allowance.'],
    impact: 'Affects anyone starting an apprenticeship this year.',
    action: 'Check your eligibility.',
    topics: ['apprenticeships', 'skills-training'],
    audience: ['apprentices'],
    importance: 4,
    readingMinutes: 2,
    aiModel: 'rule-based',
  });

  await upsertJob({
    source: 'sample',
    title: 'Junior React Developer',
    company: 'Test Co',
    location: 'Manchester',
    region: 'North West',
    remote: true,
    salaryMin: 32000,
    salaryMax: 40000,
    salaryText: '£32,000 – £40,000',
    category: 'IT & Technology',
    url: 'https://example.com/jobs/junior-react',
    description: 'React, TypeScript and Node. Graduate friendly.',
    postedAt: new Date().toISOString(),
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  // Windows will not delete the directory while SQLite still holds the file.
  await db.close();
  fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
});

describe('meta routes', () => {
  it('reports health', async () => {
    const { status, body } = await api('/api/health');
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });

  it('exposes the taxonomy the app renders', async () => {
    const { body } = await api('/api/taxonomy');
    assert.ok(body.topics.length > 5);
    assert.ok(body.topics.every((topic) => topic.id && topic.label));
    assert.ok(body.regions.includes('Scotland'));
  });

  it('lists only trusted sources', async () => {
    const { body } = await api('/api/sources');
    assert.ok(body.sources.length >= 15);
    assert.ok(body.sources.some((source) => source.kind === 'policy'));
    assert.ok(body.sources.some((source) => source.kind === 'news'));
  });
});

describe('feed routes', () => {
  it('returns stored items', async () => {
    const { body } = await api('/api/feed');
    assert.equal(body.personalised, false);
    assert.ok(body.items.length >= 1);
  });

  it('separates policy from news', async () => {
    const { body } = await api('/api/policies');
    assert.ok(body.items.every((item) => item.kind === 'policy'));
  });

  it('filters by topic', async () => {
    const { body } = await api('/api/feed?topics=apprenticeships');
    assert.ok(body.items.length >= 1);
    const { body: none } = await api('/api/feed?topics=immigration-visas');
    assert.equal(none.items.length, 0);
  });

  it('404s an unknown item', async () => {
    const { status } = await api('/api/items/does-not-exist');
    assert.equal(status, 404);
  });
});

describe('users and personalisation', () => {
  it('creates a user, updates the profile and ranks the feed for it', async () => {
    const created = await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Test', profile: { topics: ['apprenticeships'] } }),
    });
    assert.equal(created.status, 201);
    const userId = created.body.user.id;

    const patched = await api(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ profile: { location: 'Manchester', notifications: { digestHour: 6 } } }),
    });
    assert.equal(patched.body.user.profile.location, 'Manchester');
    assert.equal(patched.body.user.profile.notifications.digestHour, 6);
    // Merging must not drop the topics set earlier.
    assert.deepEqual(patched.body.user.profile.topics, ['apprenticeships']);

    const feed = await api(`/api/feed?userId=${userId}`);
    assert.equal(feed.body.personalised, true);
    assert.ok(feed.body.items[0].score > 0);
  });

  it('rejects an invalid topic', async () => {
    const { status, body } = await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ profile: { topics: ['not-a-real-topic'] } }),
    });
    assert.equal(status, 400);
    assert.equal(body.error, 'Invalid request');
  });

  it('saves and unsaves items', async () => {
    const { body: created } = await api('/api/users', { method: 'POST', body: JSON.stringify({}) });
    const userId = created.user.id;
    const itemId = idForUrl('https://example.gov.uk/apprenticeship-reform');

    await api(`/api/users/${userId}/saved`, {
      method: 'POST',
      body: JSON.stringify({ entity: 'item', entityId: itemId }),
    });
    const saved = await api(`/api/users/${userId}/saved`);
    assert.equal(saved.body.items.length, 1);

    await api(`/api/users/${userId}/saved/item/${itemId}`, { method: 'DELETE' });
    const empty = await api(`/api/users/${userId}/saved`);
    assert.equal(empty.body.items.length, 0);
  });
});

describe('jobs', () => {
  it('searches the cache', async () => {
    const { body } = await api('/api/jobs?search=react');
    assert.equal(body.jobs.length, 1);
    assert.equal(body.jobs[0].remote, true);
  });

  it('treats remote=false as false, not truthy', async () => {
    const { body } = await api('/api/jobs?remote=false');
    assert.equal(body.jobs.length, 1);
  });

  it('respects the salary floor', async () => {
    const { body } = await api('/api/jobs?salaryMin=50000');
    assert.equal(body.jobs.length, 0);
  });

  it('scores lexical fit against a profile', async () => {
    const [job] = await listJobs({ limit: 1 });
    const strong = scoreJobLexically(job, { skills: ['react', 'typescript'], location: 'Manchester' });
    const weak = scoreJobLexically(job, { skills: ['welding'], location: 'Truro' });
    assert.ok(strong.score > weak.score);
  });
});

describe('AI layer without an API key', () => {
  it('reports rule-based mode', async () => {
    const { body } = await api('/api/ai/status');
    assert.equal(body.enabled, false);
    assert.equal(body.mode, 'rule-based');
  });

  it('still answers career questions', async () => {
    const { body } = await api('/api/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ question: 'How do I improve my CV for a UK employer?' }),
    });
    assert.match(body.answer, /two pages/i);
    assert.equal(body.model, 'rule-based');
    assert.ok(body.followUps.length > 0);
  });

  it('still prepares interview questions', async () => {
    const { body } = await api('/api/ai/interview', {
      method: 'POST',
      body: JSON.stringify({ role: 'Software Engineer' }),
    });
    assert.ok(body.questions.length >= 5);
    assert.ok(body.questionsToAskThem.length >= 2);
  });

  it('rejects a CV that is too short to review', async () => {
    const { status } = await api('/api/ai/cv-review', {
      method: 'POST',
      body: JSON.stringify({ cvText: 'too short' }),
    });
    assert.equal(status, 400);
  });
});

describe('CV heuristics', () => {
  const weakCv = `Jane Doe
Responsible for customer accounts. Duties included answering the phone.
Worked on filing. Helped with reports.`;

  const strongCv = `Jane Doe — Manchester — 07700 900123 — jane@example.com

Personal statement
Customer operations lead with eight years in regulated financial services.

Work experience
Operations Lead, Example Bank (2020 - present)
- Cut complaint handling time by 32% by redesigning the triage process.
- Led a team of 12 people across two sites, handling 400 cases a week.
- Saved £45,000 a year by renegotiating the courier contract.

Education
BA Business Management, University of Manchester

Skills
Excel, SQL, complaint handling, team leadership`;

  it('penalises duty-based phrasing and missing metrics', () => {
    const weak = cvHeuristics({ cvText: weakCv, targetRole: 'Operations Lead' });
    const strong = cvHeuristics({ cvText: strongCv, targetRole: 'Operations Lead' });
    assert.ok(strong.score > weak.score, `${strong.score} should beat ${weak.score}`);
    assert.ok(weak.improvements.some((entry) => /duty-based/i.test(entry.issue)));
  });

  it('finds contact details and counts quantified bullets', () => {
    const result = cvHeuristics({ cvText: strongCv });
    assert.equal(result.stats.hasEmail, true);
    assert.equal(result.stats.hasPhone, true);
    assert.ok(result.stats.bulletsWithNumbers >= 3);
  });

  it('surfaces keywords the advert uses but the CV does not', () => {
    const result = cvHeuristics({
      cvText: strongCv,
      targetRole: 'Operations Lead',
      jobAdvert: 'We need someone with Lean Six Sigma and Salesforce administration.',
    });
    assert.ok(result.missingKeywords.includes('salesforce'));
  });
});

describe('notification digest', () => {
  it('builds a digest from the user’s topics and reports it via the preview endpoint', async () => {
    const { body: created } = await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        profile: {
          topics: ['apprenticeships'],
          audience: ['apprentices'],
          notifications: { enabled: true, digestHour: 6, jobAlerts: true },
        },
      }),
    });
    const userId = created.user.id;

    const { status, body } = await api(`/api/notifications/${userId}/preview`);
    assert.equal(status, 200);
    assert.equal(body.enabled, true);
    assert.equal(body.scheduledHour, 6);
    assert.equal(body.devices, 0);
    assert.ok(body.items.some((item) => item.topics.includes('apprenticeships')));
    assert.ok(body.currentUkHour >= 0 && body.currentUkHour <= 23);
  });

  it('refuses a test push when no device is registered', async () => {
    const { body: created } = await api('/api/users', { method: 'POST', body: JSON.stringify({}) });
    const { status } = await api(`/api/notifications/${created.user.id}/test`, { method: 'POST' });
    assert.equal(status, 409);
  });

  it('accepts a device registration', async () => {
    const { body: created } = await api('/api/users', { method: 'POST', body: JSON.stringify({}) });
    const { status, body } = await api(`/api/users/${created.user.id}/devices`, {
      method: 'POST',
      body: JSON.stringify({ token: 'ExponentPushToken[test-token-value]', platform: 'ios' }),
    });
    assert.equal(status, 201);
    assert.equal(body.devices, 1);
  });
});

describe('personalised ranking', () => {
  it('puts matching topics above non-matching ones', async () => {
    await insertItem({
      id: idForUrl('https://example.com/unrelated'),
      kind: 'news',
      sourceId: 'bbc-business',
      sourceName: 'BBC Business',
      title: 'Unrelated market story',
      url: 'https://example.com/unrelated',
      publishedAt: new Date().toISOString(),
      rawSummary: 'Markets moved.',
      headline: 'Unrelated market story',
      bullets: [],
      topics: ['economy'],
      audience: ['employees'],
      importance: 2,
      readingMinutes: 1,
      aiModel: 'rule-based',
    });

    const ranked = await rankedForProfile({ topics: ['apprenticeships'], audience: ['apprentices'] }, { limit: 5 });
    assert.equal(ranked[0].topics.includes('apprenticeships'), true);
  });
});
