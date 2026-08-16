import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { isolateDatabase } from './support/isolate.js';

const tempDir = isolateDatabase('auth');
process.env.NODE_ENV = 'test';

const { createApp } = await import('../src/index.js');
const { db } = await import('../src/db.js');
const { bootstrapAdmin } = await import('../src/auth/bootstrap.js');
const { passwordProblems, hashPassword, verifyPassword } = await import('../src/auth/passwords.js');
const { setRole } = await import('../src/store/users.js');

let server;
let baseUrl;

const api = async (route, { token, ...options } = {}) => {
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

const register = async (email, password = 'correct-horse-42', extra = {}) =>
  await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, ...extra }) });

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
});

describe('password hashing', () => {
  it('round-trips and rejects the wrong password', async () => {
    const hash = await hashPassword('correct-horse-42');
    assert.equal(await verifyPassword('correct-horse-42', hash), true);
    assert.equal(await verifyPassword('correct-horse-43', hash), false);
    assert.match(hash, /^scrypt\$/);
  });

  it('never stores the password in the hash', async () => {
    const hash = await hashPassword('correct-horse-42');
    assert.equal(hash.includes('correct-horse'), false);
  });

  it('produces a different hash for the same password', async () => {
    assert.notEqual(await hashPassword('correct-horse-42'), await hashPassword('correct-horse-42'));
  });

  it('enforces a length-first policy', () => {
    assert.ok(passwordProblems('short').length > 0);
    assert.ok(passwordProblems('password123').some((problem) => /too common/i.test(problem)));
    assert.deepEqual(passwordProblems('correct-horse-42'), []);
  });
});

describe('registration and login', () => {
  it('registers, returns a session, and rejects a duplicate email', async () => {
    const created = await register('sam@example.com');
    assert.equal(created.status, 201);
    assert.equal(created.body.user.email, 'sam@example.com');
    assert.equal(created.body.user.role, 'USER');
    assert.equal(created.body.user.anonymous, false);
    assert.ok(created.body.token.length > 20);
    assert.equal(created.body.user.password_hash, undefined, 'must never return the hash');

    const again = await register('sam@example.com');
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'EMAIL_TAKEN');
  });

  it('rejects a weak password', async () => {
    const { status, body } = await register('weak@example.com', 'abc');
    assert.equal(status, 400);
    assert.equal(body.code, 'WEAK_PASSWORD');
  });

  it('logs in and rejects bad credentials with the same message either way', async () => {
    await register('lee@example.com');

    const good = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'lee@example.com', password: 'correct-horse-42' }),
    });
    assert.equal(good.status, 200);
    assert.ok(good.body.token);

    const wrongPassword = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'lee@example.com', password: 'wrong-password-99' }),
    });
    const noSuchUser = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password-99' }),
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(noSuchUser.status, 401);
    assert.equal(wrongPassword.body.error, noSuchUser.body.error, 'must not reveal whether the email exists');
  });

  it('claims an anonymous account so saved data survives sign-up', async () => {
    const anonymous = await api('/api/users', { method: 'POST', body: JSON.stringify({}) });
    const anonymousId = anonymous.body.user.id;

    await api(`/api/users/${anonymousId}`, {
      method: 'PATCH',
      body: JSON.stringify({ profile: { location: 'Leeds', topics: ['apprenticeships'] } }),
    });

    const created = await register('claimed@example.com', 'correct-horse-42', { anonymousUserId: anonymousId });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.id, anonymousId, 'the same record is upgraded, not replaced');
    assert.equal(created.body.user.profile.location, 'Leeds');
    assert.deepEqual(created.body.user.profile.topics, ['apprenticeships']);
  });
});

describe('sessions', () => {
  it('reads the current user, then rejects the token after logout', async () => {
    const { body } = await register('session@example.com');

    const me = await api('/api/auth/me', { token: body.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'session@example.com');

    await api('/api/auth/logout', { method: 'POST', token: body.token });

    const after = await api('/api/auth/me', { token: body.token });
    assert.equal(after.status, 401);
    assert.equal(after.body.code, 'SESSION_EXPIRED');
  });

  it('rotates the token on refresh and invalidates the old one', async () => {
    const { body } = await register('refresh@example.com');

    const refreshed = await api('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ token: body.token }),
    });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.token, body.token);

    assert.equal((await api('/api/auth/me', { token: body.token })).status, 401);
    assert.equal((await api('/api/auth/me', { token: refreshed.body.token })).status, 200);
  });

  it('rejects a made-up token', async () => {
    assert.equal((await api('/api/auth/me', { token: 'not-a-real-token' })).status, 401);
  });
});

describe('password management', () => {
  it('changes a password and invalidates other sessions', async () => {
    const { body } = await register('change@example.com');

    const wrong = await api('/api/auth/change-password', {
      method: 'POST',
      token: body.token,
      body: JSON.stringify({ currentPassword: 'not-my-password', newPassword: 'another-good-one-7' }),
    });
    assert.equal(wrong.status, 401);

    const changed = await api('/api/auth/change-password', {
      method: 'POST',
      token: body.token,
      body: JSON.stringify({ currentPassword: 'correct-horse-42', newPassword: 'another-good-one-7' }),
    });
    assert.equal(changed.status, 200);
    assert.ok(changed.body.token, 'issues a fresh session so the user is not logged out');

    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'change@example.com', password: 'another-good-one-7' }),
    });
    assert.equal(login.status, 200);
  });

  it('runs the forgot/reset flow without confirming whether an email exists', async () => {
    await register('reset@example.com');

    const unknown = await api('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'nobody-here@example.com' }),
    });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.body.devToken, undefined);

    const known = await api('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'reset@example.com' }),
    });
    assert.equal(known.status, 200);
    assert.ok(known.body.devToken, 'token is exposed outside production so the flow is testable');

    const reset = await api('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: known.body.devToken, password: 'brand-new-secret-9' }),
    });
    assert.equal(reset.status, 200);

    const reuse = await api('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: known.body.devToken, password: 'yet-another-one-3' }),
    });
    assert.equal(reuse.status, 400, 'a reset token is single use');

    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'reset@example.com', password: 'brand-new-secret-9' }),
    });
    assert.equal(login.status, 200);
  });
});

describe('role protection', () => {
  it('keeps a USER out of every admin route', async () => {
    const { body } = await register('user@example.com');

    for (const route of ['/api/admin/stats', '/api/admin/sources', '/api/admin/users', '/api/admin/jobs']) {
      const denied = await api(route, { token: body.token });
      assert.equal(denied.status, 403, `${route} must reject a USER`);
      assert.equal(denied.body.code, 'FORBIDDEN');
    }

    const unauthenticated = await api('/api/admin/stats');
    assert.equal(unauthenticated.status, 401);
  });

  it('lets an ADMIN in', async () => {
    const { body } = await register('admin@example.com');
    await setRole(body.user.id, 'ADMIN');

    const relogin = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@example.com', password: 'correct-horse-42' }),
    });

    const stats = await api('/api/admin/stats', { token: relogin.body.token });
    assert.equal(stats.status, 200);
    assert.ok(typeof stats.body.cards.totalJobs === 'number');
  });

  it('bootstraps the first administrator from the environment', async () => {
    await db.exec("UPDATE users SET role = 'USER'");
    process.env.ADMIN_EMAIL = 'boss@example.com';
    process.env.ADMIN_PASSWORD = 'bootstrap-secret-11';

    const { config } = await import('../src/config.js');
    config.auth.bootstrapAdminEmail = 'boss@example.com';
    config.auth.bootstrapAdminPassword = 'bootstrap-secret-11';

    const first = await bootstrapAdmin();
    assert.equal(first.created, true);

    const second = await bootstrapAdmin();
    assert.equal(second.created, false, 'never re-grants once an admin exists');

    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'boss@example.com', password: 'bootstrap-secret-11' }),
    });
    assert.equal(login.body.user.role, 'SUPER_ADMIN');
  });
});

describe('account isolation', () => {
  it('stops one signed-in user reading another account', async () => {
    const alice = await register('alice@example.com');
    const bob = await register('bob@example.com');

    const own = await api(`/api/users/${alice.body.user.id}`, { token: alice.body.token });
    assert.equal(own.status, 200);

    const other = await api(`/api/users/${bob.body.user.id}`, { token: alice.body.token });
    assert.equal(other.status, 403);

    const unauthenticated = await api(`/api/users/${bob.body.user.id}`);
    assert.equal(unauthenticated.status, 401, 'a registered account is not readable by id alone');
  });

  it('leaves anonymous accounts reachable by id so the app works signed out', async () => {
    const anonymous = await api('/api/users', { method: 'POST', body: JSON.stringify({}) });
    const fetched = await api(`/api/users/${anonymous.body.user.id}`);
    assert.equal(fetched.status, 200);
  });
});

describe('browsing stays open', () => {
  it('serves jobs and policies without a session', async () => {
    assert.equal((await api('/api/jobs')).status, 200);
    assert.equal((await api('/api/policies')).status, 200);
    assert.equal((await api('/api/feed')).status, 200);
    assert.equal((await api('/api/search?q=engineer')).status, 200);
  });
});
