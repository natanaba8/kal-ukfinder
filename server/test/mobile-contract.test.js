import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { isolateDatabase } from './support/isolate.js';

/**
 * The app/server contract.
 *
 * pr.md §39 asks for the mobile flows to be tested — login, jobs, policies,
 * search, filters, favourites, profile, logout. The screens themselves need a
 * device, but the contract they depend on does not: this walks the exact
 * sequence `apps/mobile/src/lib/api.ts` performs and asserts the response
 * shapes declared in `apps/mobile/src/lib/types.ts`. If the server ever drifts
 * from what the app expects, this fails rather than the app failing at runtime.
 */

const tempDir = isolateDatabase('contract');
process.env.NODE_ENV = 'test';

const { createApp } = await import('../src/index.js');
const { db } = await import('../src/db.js');
const { insertItem, idForUrl } = await import('../src/store/items.js');
const { upsertJob } = await import('../src/store/jobs.js');

let server;
let baseUrl;

/** Mirrors the app's fetch wrapper, including the Bearer header. */
const call = async (route, { token, ...options } = {}) => {
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

const hasKeys = (object, keys, label) => {
  for (const key of keys) {
    assert.ok(key in object, `${label} is missing "${key}" — the app's type declares it`);
  }
};

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await insertItem({
    id: idForUrl('https://example.gov.uk/wage-rates'),
    kind: 'policy',
    sourceId: 'govuk-dwp',
    sourceName: 'DWP',
    sourceTrust: 'official',
    title: 'National Living Wage rates confirmed for April',
    url: 'https://example.gov.uk/wage-rates',
    publishedAt: new Date().toISOString(),
    rawSummary: 'New rates apply to all workers aged 21 and over.',
    headline: 'National Living Wage rates confirmed',
    bullets: ['Rates rise in April.', 'Applies to workers aged 21 and over.'],
    impact: 'Check your payslip against the new rate from April.',
    action: 'Compare the change against your contract.',
    topics: ['pay-rights'],
    audience: ['employees'],
    importance: 4,
    readingMinutes: 2,
    aiModel: 'rule-based',
    category: 'Employment',
  });

  await upsertJob({
    source: 'sample',
    dbSourceId: 'sample',
    title: 'Registered Nurse',
    company: 'Northern Care Trust',
    location: 'Leeds',
    region: 'Yorkshire and the Humber',
    remote: false,
    salaryMin: 29970,
    salaryMax: 36483,
    salaryText: '£29,970 – £36,483',
    contractType: 'full_time',
    employmentType: 'full_time',
    category: 'Healthcare & Nursing',
    url: 'https://example.com/jobs/nurse',
    description: 'Band 5 acute medicine post.',
    requirements: 'NMC registration required.',
    deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    postedAt: new Date().toISOString(),
    contentHash: 'contract-test-hash',
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
});

describe('first launch, signed out', () => {
  let anonymousId;

  it('creates the anonymous record the app boots with', async () => {
    const { status, body } = await call('/api/users', { method: 'POST', body: JSON.stringify({}) });
    assert.equal(status, 201);
    hasKeys(body.user, ['id', 'displayName', 'email', 'role', 'anonymous', 'profile'], 'user');
    assert.equal(body.user.anonymous, true);
    hasKeys(
      body.user.profile,
      ['headline', 'location', 'topics', 'audience', 'skills', 'remoteOnly', 'salaryMin', 'notifications'],
      'profile',
    );
    hasKeys(body.user.profile.notifications, ['enabled', 'digestHour', 'jobAlerts', 'policyAlerts'], 'notifications');

    anonymousId = body.user.id;
  });

  it('saves the onboarding answers', async () => {
    const { status, body } = await call(`/api/users/${anonymousId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        displayName: 'Sam',
        profile: {
          location: 'Leeds',
          topics: ['pay-rights'],
          audience: ['employees'],
          experienceLevel: 'mid',
          notifications: { enabled: true, digestHour: 7 },
        },
      }),
    });

    assert.equal(status, 200);
    assert.equal(body.user.profile.location, 'Leeds');
    assert.equal(body.user.profile.notifications.digestHour, 7);
    assert.equal(body.user.profile.notifications.jobAlerts, true, 'unset notification keys keep their defaults');
  });

  it('serves the personalised briefing', async () => {
    const { body } = await call(`/api/feed?userId=${anonymousId}&pageSize=40`);
    assert.equal(body.personalised, true);
    assert.ok(Array.isArray(body.items));
    assert.ok(Array.isArray(body.data), 'both keys are present so older clients keep working');

    const [item] = body.items;
    hasKeys(
      item,
      ['id', 'kind', 'source', 'headline', 'url', 'publishedAt', 'summary', 'impact', 'action', 'topics', 'aiModel'],
      'briefing item',
    );
    hasKeys(item.source, ['id', 'name', 'trust'], 'item.source');
    assert.ok(Array.isArray(item.summary));
  });

  it('serves paginated jobs with the keys the Jobs screen reads', async () => {
    const { body } = await call('/api/jobs?page=1&pageSize=20');
    hasKeys(body, ['jobs', 'data', 'page', 'pageSize', 'total', 'pages', 'personalised'], 'jobs response');

    const [job] = body.jobs;
    hasKeys(
      job,
      ['id', 'title', 'company', 'location', 'remote', 'salaryText', 'employmentType', 'requirements', 'deadline', 'url', 'postedAt', 'isSample', 'status', 'featured'],
      'job',
    );
    assert.equal(job.status, 'published');
  });

  it('serves the filter options the filter sheet renders', async () => {
    const { body } = await call('/api/jobs/categories');
    hasKeys(body, ['categories', 'locations', 'organizations'], 'job filters');
    assert.ok(body.locations.some((entry) => entry.location === 'Leeds'));
  });

  it('applies every filter the sheet can set', async () => {
    const cases = [
      ['location=Leeds', 1],
      ['location=Truro', 0],
      ['employmentType=full_time', 1],
      ['employmentType=apprenticeship', 0],
      ['organization=Northern', 1],
      ['category=Healthcare', 1],
      ['remote=true', 0],
      ['salaryMin=60000', 0],
      ['openOnly=true', 1],
    ];

    for (const [query, expected] of cases) {
      const { body } = await call(`/api/jobs?${query}`);
      assert.equal(body.total, expected, `?${query} returned ${body.total}, expected ${expected}`);
    }
  });

  it('serves paginated policies and their categories', async () => {
    const { body } = await call('/api/policies?page=1&pageSize=20');
    hasKeys(body, ['items', 'data', 'page', 'pageSize', 'total', 'pages'], 'policies response');

    const categories = await call('/api/policies/categories');
    assert.ok(Array.isArray(categories.body.categories));
  });

  it('searches across both content types', async () => {
    const { body } = await call('/api/search?q=nurse');
    hasKeys(body, ['query', 'jobs', 'policies', 'total'], 'search response');
    assert.equal(body.jobs.total, 1);
  });

  it('answers the coach without an account', async () => {
    const { status, body } = await call('/api/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ question: 'How do I write a UK CV?' }),
    });
    assert.equal(status, 200);
    hasKeys(body, ['answer', 'followUps', 'checkWith', 'model'], 'coach answer');
  });

  it('reviews a CV and prepares an interview', async () => {
    const cv = await call('/api/ai/cv-review', {
      method: 'POST',
      body: JSON.stringify({
        cvText: 'Jane Doe — jane@example.com — 07700 900123. Operations lead. Cut errors by 30%. Led 12 people.',
        targetRole: 'Operations Lead',
      }),
    });
    hasKeys(cv.body, ['score', 'verdict', 'strengths', 'improvements', 'rewrittenSummary', 'missingKeywords', 'atsNotes', 'model'], 'cv review');

    const interview = await call('/api/ai/interview', {
      method: 'POST',
      body: JSON.stringify({ role: 'Registered Nurse' }),
    });
    hasKeys(interview.body, ['format', 'questions', 'questionsToAskThem', 'preparationChecklist'], 'interview plan');
  });

  it('previews the notification digest', async () => {
    const { body } = await call(`/api/notifications/${anonymousId}/preview`);
    hasKeys(body, ['scheduledHour', 'currentUkHour', 'enabled', 'devices', 'items', 'jobs'], 'digest preview');
  });
});

describe('signing up and staying signed in', () => {
  let token;
  let userId;

  it('claims the anonymous record, keeping its saved items', async () => {
    const anonymous = await call('/api/users', { method: 'POST', body: JSON.stringify({}) });
    const anonymousId = anonymous.body.user.id;

    const itemId = idForUrl('https://example.gov.uk/wage-rates');
    await call(`/api/users/${anonymousId}/saved`, {
      method: 'POST',
      body: JSON.stringify({ entity: 'item', entityId: itemId }),
    });

    const registered = await call('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'sam@example.com',
        password: 'correct-horse-42',
        displayName: 'Sam',
        anonymousUserId: anonymousId,
      }),
    });

    assert.equal(registered.status, 201);
    hasKeys(registered.body, ['user', 'token'], 'auth response');
    assert.equal(registered.body.user.id, anonymousId);

    token = registered.body.token;
    userId = registered.body.user.id;

    const saved = await call(`/api/users/${userId}/saved`, { token });
    assert.equal(saved.body.items.length, 1, 'the bookmark survived signing up');
  });

  it('reads and updates the account through the /me routes', async () => {
    const me = await call('/api/auth/me', { token });
    assert.equal(me.body.user.email, 'sam@example.com');
    assert.equal(me.body.user.anonymous, false);

    const patched = await call('/api/users/me', {
      method: 'PATCH',
      token,
      body: JSON.stringify({ profile: { skills: ['triage', 'safeguarding'] } }),
    });
    assert.deepEqual(patched.body.user.profile.skills, ['triage', 'safeguarding']);
  });

  it('scores job matches once a profile exists', async () => {
    const { body } = await call('/api/jobs?rank=match', { token });
    assert.equal(body.personalised, true);
    hasKeys(body.jobs[0].match, ['id', 'score', 'reasons', 'gaps'], 'job match');
  });

  it('saves and removes a job', async () => {
    const jobs = await call('/api/jobs', { token });
    const jobId = jobs.body.jobs[0].id;

    await call(`/api/users/${userId}/saved`, {
      method: 'POST',
      token,
      body: JSON.stringify({ entity: 'job', entityId: jobId }),
    });
    assert.equal((await call(`/api/users/${userId}/saved`, { token })).body.jobs.length, 1);

    await call(`/api/users/${userId}/saved/job/${jobId}`, { method: 'DELETE', token });
    assert.equal((await call(`/api/users/${userId}/saved`, { token })).body.jobs.length, 0);
  });

  it('keeps the coach thread against the account', async () => {
    await call('/api/ai/ask', {
      method: 'POST',
      token,
      body: JSON.stringify({ question: 'What should I ask at the end of an interview?' }),
    });

    const thread = await call(`/api/ai/thread/${userId}`, { token });
    assert.equal(thread.body.messages.length, 2, 'the question and the answer are both stored');
    hasKeys(thread.body.messages[0], ['id', 'role', 'content', 'meta', 'createdAt'], 'coach message');
  });

  it('registers a push token', async () => {
    const { status, body } = await call(`/api/users/${userId}/devices`, {
      method: 'POST',
      token,
      body: JSON.stringify({ token: 'ExponentPushToken[contract-test]', platform: 'ios' }),
    });
    assert.equal(status, 201);
    assert.equal(body.devices, 1);
  });

  it('rotates the token the way the app refreshes on a 401', async () => {
    const refreshed = await call('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ token }) });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.token, token);

    token = refreshed.body.token;
    assert.equal((await call('/api/auth/me', { token })).status, 200);
  });

  it('signs out', async () => {
    assert.equal((await call('/api/auth/logout', { method: 'POST', token })).status, 200);
    assert.equal((await call('/api/auth/me', { token })).status, 401);

    // Browsing still works afterwards — that is the whole point of open access.
    assert.equal((await call('/api/jobs')).status, 200);
    assert.equal((await call('/api/policies')).status, 200);
  });
});
