import crypto from 'node:crypto';

import { config } from '../config.js';
import { bind, db, nowIso } from '../db.js';
import { generateToken, hashToken } from './passwords.js';

/**
 * Opaque, database-backed sessions rather than JWTs.
 *
 * The admin panel needs to disable an account and have it take effect at once
 * (pr.md §27), which a stateless token cannot do without a revocation list —
 * at which point it is a session table with extra steps. Tokens are random,
 * stored only as a SHA-256 hash, and rotated on refresh.
 */

const ttlMs = () => config.auth.sessionDays * 86_400_000;

export const createSession = ({ userId, userAgent, ip }) => {
  const token = generateToken();
  const timestamp = nowIso();

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, user_agent, ip, created_at, last_used_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    userId,
    hashToken(token),
    bind((userAgent ?? '').slice(0, 300)),
    bind(ip),
    timestamp,
    timestamp,
    new Date(Date.now() + ttlMs()).toISOString(),
  );

  return { token, expiresAt: new Date(Date.now() + ttlMs()).toISOString() };
};

/**
 * Look a token up and return its user. Touches `last_used_at` at most once a
 * minute so an active session does not write on every single request.
 */
export const resolveSession = (token) => {
  if (!token) return null;

  const row = db
    .prepare(`
      SELECT s.id AS session_id, s.expires_at, s.revoked_at, s.last_used_at, u.*
        FROM sessions s
        JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
    `)
    .get(hashToken(token));

  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  if (row.status === 'DISABLED') return { disabled: true };

  if (Date.now() - new Date(row.last_used_at).getTime() > 60_000) {
    db.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').run(nowIso(), row.session_id);
  }

  return { sessionId: row.session_id, userId: row.id, role: row.role, status: row.status };
};

/** Rotate: issue a new token and revoke the old one in a single step. */
export const rotateSession = (token, context) => {
  const existing = resolveSession(token);
  if (!existing || existing.disabled) return null;

  revokeSession(token);
  return { ...createSession({ userId: existing.userId, ...context }), userId: existing.userId };
};

export const revokeSession = (token) =>
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(
    nowIso(),
    hashToken(token),
  ).changes;

export const revokeAllForUser = (userId) =>
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso(), userId)
    .changes;

export const activeSessionCount = (userId) =>
  db
    .prepare('SELECT COUNT(*) AS total FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?')
    .get(userId, nowIso()).total;

/** Housekeeping — called from the scheduler. */
export const pruneExpiredSessions = () =>
  db.prepare('DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL').run(
    new Date(Date.now() - 7 * 86_400_000).toISOString(),
  ).changes;

// --- password resets --------------------------------------------------------

export const createPasswordReset = (userId) => {
  const token = generateToken();

  db.prepare(`
    INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    userId,
    hashToken(token),
    nowIso(),
    new Date(Date.now() + config.auth.resetTokenMinutes * 60_000).toISOString(),
  );

  return token;
};

export const consumePasswordReset = (token) => {
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(hashToken(token));
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(nowIso(), row.id);
  return row.user_id;
};
