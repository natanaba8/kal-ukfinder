import crypto from 'node:crypto';

import { bind, db, fromJson, nowIso, toJson } from '../db.js';

export const DEFAULT_PROFILE = {
  headline: '',
  sector: '',
  location: '',
  experienceLevel: '',
  skills: [],
  jobTitles: [],
  topics: ['jobs-market', 'skills-training'],
  audience: ['jobseekers'],
  salaryMin: null,
  remoteOnly: false,
  rightToWork: '',
  notifications: {
    enabled: true,
    /** Local hour (24h, UK time) for the daily briefing. */
    digestHour: 8,
    jobAlerts: true,
    policyAlerts: true,
    weeklyReview: true,
  },
};

const rowToUser = (row) => ({
  id: row.id,
  displayName: row.display_name || '',
  email: row.email || null,
  role: row.role || 'USER',
  status: row.status || 'ACTIVE',
  anonymous: row.anonymous === 1,
  lastLoginAt: row.last_login_at || null,
  profile: { ...DEFAULT_PROFILE, ...fromJson(row.profile, {}) },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export { rowToUser };

/**
 * Anonymous account, created on first launch so the app works before anyone
 * signs up. It is upgraded in place by `attachCredentials` when the person
 * registers, so saved items and coach history survive (pr.md §42.2).
 */
export const createUser = ({ displayName = '', profile = {} } = {}) => {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  db.prepare('INSERT INTO users (id, display_name, profile, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    bind(displayName),
    toJson({ ...DEFAULT_PROFILE, ...profile }),
    timestamp,
    timestamp,
  );
  return getUser(id);
};

export const normaliseEmail = (email) => String(email ?? '').trim().toLowerCase();

export const getUserByEmail = (email) => {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normaliseEmail(email));
  return row ? rowToUser(row) : null;
};

export const getPasswordHash = (userId) =>
  db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId)?.password_hash ?? null;

/** Turn an existing anonymous row into a real account, keeping its data. */
export const attachCredentials = (userId, { email, passwordHash, displayName }) => {
  db.prepare(`
    UPDATE users
       SET email = ?, password_hash = ?, display_name = COALESCE(NULLIF(?, ''), display_name),
           anonymous = 0, updated_at = ?
     WHERE id = ?
  `).run(normaliseEmail(email), passwordHash, bind(displayName ?? ''), nowIso(), userId);

  return getUser(userId);
};

export const setPasswordHash = (userId, passwordHash) =>
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    passwordHash,
    nowIso(),
    userId,
  ).changes;

export const recordLogin = (userId) =>
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), userId).changes;

export const setRole = (userId, role) =>
  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, nowIso(), userId).changes;

export const setStatus = (userId, status) =>
  db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), userId).changes;

export const deleteUser = (userId) => db.prepare('DELETE FROM users WHERE id = ?').run(userId).changes;

/**
 * Admin user list with search, role filter and pagination (pr.md §27).
 */
export const listUsersPaged = ({ search, role, status, includeAnonymous = false, page = 1, pageSize = 25 } = {}) => {
  const where = [];
  const params = [];

  if (!includeAnonymous) where.push('anonymous = 0');
  if (search) {
    where.push('(email LIKE ? OR display_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (role) {
    where.push('role = ?');
    params.push(role);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS total FROM users${clause}`).get(...params).total;
  const limit = Math.min(100, Math.max(1, pageSize));

  const rows = db
    .prepare(`SELECT * FROM users${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (Math.max(1, page) - 1) * limit);

  return { data: rows.map(rowToUser), total, page: Math.max(1, page), pageSize: limit };
};

export const userCounts = () => ({
  total: db.prepare('SELECT COUNT(*) AS total FROM users WHERE anonymous = 0').get().total,
  anonymous: db.prepare('SELECT COUNT(*) AS total FROM users WHERE anonymous = 1').get().total,
  admins: db.prepare("SELECT COUNT(*) AS total FROM users WHERE role IN ('ADMIN','SUPER_ADMIN')").get().total,
  disabled: db.prepare("SELECT COUNT(*) AS total FROM users WHERE status = 'DISABLED'").get().total,
  newToday: db.prepare('SELECT COUNT(*) AS total FROM users WHERE anonymous = 0 AND created_at >= ?').get(
    new Date(Date.now() - 86_400_000).toISOString(),
  ).total,
});

export const getUser = (id) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return row ? rowToUser(row) : null;
};

export const updateUser = (id, { displayName, profile }) => {
  const existing = getUser(id);
  if (!existing) return null;

  const merged = {
    ...existing.profile,
    ...profile,
    notifications: { ...existing.profile.notifications, ...(profile?.notifications ?? {}) },
  };

  db.prepare('UPDATE users SET display_name = ?, profile = ?, updated_at = ? WHERE id = ?').run(
    bind(displayName ?? existing.displayName),
    toJson(merged),
    nowIso(),
    id,
  );
  return getUser(id);
};

export const listUsers = () => db.prepare('SELECT * FROM users').all().map(rowToUser);

// --- devices ---------------------------------------------------------------

export const saveDevice = ({ token, userId, platform }) => {
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO devices (token, user_id, platform, created_at, last_seen)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, last_seen = excluded.last_seen
  `).run(bind(token), bind(userId), bind(platform), timestamp, timestamp);
};

export const devicesForUser = (userId) =>
  db.prepare('SELECT * FROM devices WHERE user_id = ?').all(userId).map((row) => ({
    token: row.token,
    platform: row.platform,
    lastSeen: row.last_seen,
  }));

export const removeDevice = (token) => db.prepare('DELETE FROM devices WHERE token = ?').run(token).changes;

// --- saved items -----------------------------------------------------------

export const saveEntity = (userId, entity, entityId) => {
  db.prepare(`
    INSERT INTO saved_items (user_id, entity, entity_id, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, entity, entity_id) DO NOTHING
  `).run(userId, entity, entityId, nowIso());
};

export const unsaveEntity = (userId, entity, entityId) =>
  db.prepare('DELETE FROM saved_items WHERE user_id = ? AND entity = ? AND entity_id = ?').run(userId, entity, entityId)
    .changes;

export const savedIds = (userId, entity) =>
  db
    .prepare('SELECT entity_id FROM saved_items WHERE user_id = ? AND entity = ? ORDER BY created_at DESC')
    .all(userId, entity)
    .map((row) => row.entity_id);

// --- conversation history --------------------------------------------------

export const appendMessage = ({ userId, thread = 'coach', role, content, meta = {} }) => {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO messages (id, user_id, thread, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    userId,
    thread,
    role,
    content,
    toJson(meta),
    nowIso(),
  );
  return id;
};

export const threadMessages = (userId, thread = 'coach', limit = 40) =>
  db
    .prepare('SELECT * FROM messages WHERE user_id = ? AND thread = ? ORDER BY created_at DESC LIMIT ?')
    .all(userId, thread, limit)
    .reverse()
    .map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      meta: fromJson(row.meta, {}),
      createdAt: row.created_at,
    }));

export const clearThread = (userId, thread) =>
  db.prepare('DELETE FROM messages WHERE user_id = ? AND thread = ?').run(userId, thread).changes;
