import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kal-admin-test-'));
process.env.DB_PATH = path.join(tempDir, 'test.db');
process.env.INGEST_ENABLED = 'false';
process.env.DIGEST_ENABLED = 'false';
process.env.NODE_ENV = 'test';

const { createApp } = await import('../src/index.js');
const { db } = await import('../src/db.js');
const { setRole } = await import('../src/store/users.js');

let server;
let baseUrl;
let adminToken;
let superToken;
let userToken;
let userId;

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

const api = (route, options = {}) => call(route, { token: adminToken, ...options });

const makeAccount = async (email, role) => {
  const registered = await call('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'correct-horse-42' }),
  });

  if (role) setRole(registered.body.user.id, role);

  const login = await call('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'correct-horse-42' }),
  });

  return { id: registered.body.user.id, token: login.body.token };
};

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  adminToken = (await makeAccount('admin@example.com', 'ADMIN')).token;
  superToken = (await makeAccount('super@example.com', 'SUPER_ADMIN')).token;

  const member = await makeAccount('member@example.com');
  userToken = member.token;
  userId = member.id;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
});

describe('dashboard and analytics', () => {
  it('returns every dashboard counter the panel renders', async () => {
    const { status, body } = await api('/api/admin/stats');
    assert.equal(status, 200);

    for (const key of [
      'totalJobs',
      'totalPolicies',
      'activeSources',
      'failingSources',
      'totalUsers',
      'jobsToday',
      'policiesToday',
      'pendingReview',
    ]) {
      assert.equal(typeof body.cards[key], 'number', `cards.${key} must be a number`);
    }

    assert.equal(typeof body.scraping.schedulerEnabled, 'boolean');
    assert.ok(Array.isArray(body.latest.runs));
    assert.ok(['gemini', 'rule-based'].includes(body.ai.mode));
  });

  it('returns analytics series', async () => {
    const { status, body } = await api('/api/admin/analytics?days=7');
    assert.equal(status, 200);
    assert.equal(body.days, 7);
    assert.ok(Array.isArray(body.jobsPerDay));
    assert.ok(Array.isArray(body.perSource));
  });

  it('rejects an out-of-range analytics window', async () => {
    assert.equal((await api('/api/admin/analytics?days=500')).status, 400);
  });
});

describe('settings', () => {
  it('reads defaults, saves a change, and reads it back', async () => {
    const initial = await api('/api/admin/settings');
    assert.equal(initial.status, 200);
    assert.equal(typeof initial.body.settings.defaultScrapeIntervalMinutes, 'number');
    assert.equal(typeof initial.body.readOnly.respectRobots, 'boolean');

    const saved = await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ defaultScrapeIntervalMinutes: 90, defaultModeration: 'REQUIRE_APPROVAL' }),
    });
    assert.equal(saved.body.saved, true);

    const reread = await api('/api/admin/settings');
    assert.equal(reread.body.settings.defaultScrapeIntervalMinutes, 90);
    assert.equal(reread.body.settings.defaultModeration, 'REQUIRE_APPROVAL');
  });

  it('rejects an invalid interval', async () => {
    const { status } = await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ defaultScrapeIntervalMinutes: 1 }),
    });
    assert.equal(status, 400);
  });
});

describe('user management', () => {
  it('lists registered accounts and hides anonymous ones by default', async () => {
    await call('/api/users', { method: 'POST', body: JSON.stringify({}) });

    const { body } = await api('/api/admin/users');
    assert.ok(body.total >= 3);
    assert.ok(body.data.every((user) => user.anonymous === false));

    const withAnonymous = await api('/api/admin/users?includeAnonymous=true');
    assert.ok(withAnonymous.body.total > body.total);
  });

  it('changes a role and signs the user out so it takes effect', async () => {
    assert.equal((await call('/api/admin/stats', { token: userToken })).status, 403);

    const promoted = await api(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    assert.equal(promoted.status, 200);
    assert.equal(promoted.body.user.role, 'ADMIN');

    // Their old token was revoked with the role change.
    assert.equal((await call('/api/auth/me', { token: userToken })).status, 401);

    const relogin = await call('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'member@example.com', password: 'correct-horse-42' }),
    });
    assert.equal((await call('/api/admin/stats', { token: relogin.body.token })).status, 200);
  });

  it('disables an account and blocks it immediately', async () => {
    const victim = await makeAccount('victim@example.com');
    assert.equal((await call('/api/auth/me', { token: victim.token })).status, 200);

    const disabled = await api(`/api/admin/users/${victim.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'DISABLED' }),
    });
    assert.equal(disabled.body.user.status, 'DISABLED');

    assert.equal((await call('/api/auth/me', { token: victim.token })).status, 401);

    const login = await call('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'victim@example.com', password: 'correct-horse-42' }),
    });
    assert.equal(login.status, 403);
    assert.equal(login.body.code, 'ACCOUNT_DISABLED');
  });

  it('stops an admin acting on their own account', async () => {
    const me = await call('/api/auth/me', { token: adminToken });

    const role = await api(`/api/admin/users/${me.body.user.id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'USER' }),
    });
    assert.equal(role.status, 400);
    assert.equal(role.body.code, 'SELF_ROLE_CHANGE');

    const status = await api(`/api/admin/users/${me.body.user.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'DISABLED' }),
    });
    assert.equal(status.body.code, 'SELF_DISABLE');
  });

  it('stops an ADMIN creating or touching a SUPER_ADMIN', async () => {
    const target = await makeAccount('promote-me@example.com');

    const escalate = await api(`/api/admin/users/${target.id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'SUPER_ADMIN' }),
    });
    assert.equal(escalate.status, 403, 'an ADMIN must not be able to mint a SUPER_ADMIN');

    const superUser = await call('/api/auth/me', { token: superToken });
    const touchSuper = await api(`/api/admin/users/${superUser.body.user.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'DISABLED' }),
    });
    assert.equal(touchSuper.status, 403);

    // The SUPER_ADMIN can do both.
    const allowed = await call(`/api/admin/users/${target.id}/role`, {
      method: 'PATCH',
      token: superToken,
      body: JSON.stringify({ role: 'SUPER_ADMIN' }),
    });
    assert.equal(allowed.status, 200);
  });

  it('deletes an account', async () => {
    const doomed = await makeAccount('doomed@example.com');
    assert.equal((await api(`/api/admin/users/${doomed.id}`, { method: 'DELETE' })).body.deleted, true);
    assert.equal((await api(`/api/admin/users/${doomed.id}`)).status, 404);
  });
});

describe('content filter options', () => {
  it('returns the filter lists the panel populates its dropdowns from', async () => {
    const { status, body } = await api('/api/admin/jobs/filters');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.categories));
    assert.ok(Array.isArray(body.locations));
    assert.ok(Array.isArray(body.organizations));
  });
});

describe('manual collection trigger', () => {
  it('runs the scheduler tick on demand', async () => {
    const { status, body } = await api('/api/admin/sync', { method: 'POST' });
    assert.equal(status, 200);
    assert.equal(typeof body.due, 'number');
  });
});

describe('every admin route rejects a plain user', () => {
  const ROUTES = [
    ['GET', '/api/admin/stats'],
    ['GET', '/api/admin/analytics'],
    ['GET', '/api/admin/settings'],
    ['PUT', '/api/admin/settings'],
    ['GET', '/api/admin/sources'],
    ['POST', '/api/admin/sources'],
    ['POST', '/api/admin/sources/detect'],
    ['POST', '/api/admin/sources/test'],
    ['GET', '/api/admin/jobs'],
    ['GET', '/api/admin/policies'],
    ['POST', '/api/admin/bulk'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/scrape-runs'],
    ['POST', '/api/admin/sync'],
    ['POST', '/api/admin/ingest'],
  ];

  // One plain account is enough, and keeps the suite fast — scrypt is
  // deliberately slow, so registering 15 users would dominate the run.
  let plainToken;

  before(async () => {
    plainToken = (await makeAccount('plain@example.com')).token;
  });

  for (const [method, route] of ROUTES) {
    it(`${method} ${route}`, async () => {
      const denied = await call(route, { method, token: plainToken, body: method === 'GET' ? undefined : '{}' });
      assert.equal(denied.status, 403, `${route} leaked to a USER`);

      const anonymous = await call(route, { method, body: method === 'GET' ? undefined : '{}' });
      assert.equal(anonymous.status, 401, `${route} leaked to an anonymous caller`);
    });
  }
});
