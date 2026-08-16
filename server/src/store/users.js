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
export const createUser = async ({ displayName = '', profile = {} } = {}) => {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  (await db.run('INSERT INTO users (id, display_name, profile, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [id,
    bind(displayName),
    toJson({ ...DEFAULT_PROFILE, ...profile }),
    timestamp,
    timestamp,]));
  return await getUser(id);
};

export const normaliseEmail = (email) => String(email ?? '').trim().toLowerCase();

export const getUserByEmail = async (email) => {
  const row = (await db.get('SELECT * FROM users WHERE email = ?', [normaliseEmail(email)]));
  return row ? rowToUser(row) : null;
};

export const getPasswordHash = async (userId) =>
  (await db.get('SELECT password_hash FROM users WHERE id = ?', [userId]))?.password_hash ?? null;

/** Turn an existing anonymous row into a real account, keeping its data. */
export const attachCredentials = async (userId, { email, passwordHash, displayName }) => {
  (await db.run(`
    UPDATE users
       SET email = ?, password_hash = ?, display_name = COALESCE(NULLIF(?, ''), display_name),
           anonymous = 0, updated_at = ?
     WHERE id = ?
  `, [normaliseEmail(email), passwordHash, bind(displayName ?? ''), nowIso(), userId]));

  return await getUser(userId);
};

export const setPasswordHash = async (userId, passwordHash) =>
  (await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [passwordHash,
    nowIso(),
    userId,])).changes;

export const recordLogin = async (userId) =>
  (await db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [nowIso(), userId])).changes;

export const setRole = async (userId, role) =>
  (await db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, nowIso(), userId])).changes;

export const setStatus = async (userId, status) =>
  (await db.run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), userId])).changes;

export const deleteUser = async (userId) => (await db.run('DELETE FROM users WHERE id = ?', [userId])).changes;

/**
 * Admin user list with search, role filter and pagination (pr.md §27).
 */
export const listUsersPaged = async ({ search, role, status, includeAnonymous = false, page = 1, pageSize = 25 } = {}) => {
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
  const total = (await db.get(`SELECT COUNT(*) AS total FROM users${clause}`, [...params])).total;
  const limit = Math.min(100, Math.max(1, pageSize));

  const rows = (await db.all(`SELECT * FROM users${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, (Math.max(1, page) - 1) * limit]));

  return { data: rows.map(rowToUser), total, page: Math.max(1, page), pageSize: limit };
};

export const userCounts = async () => ({
  total: (await db.get('SELECT COUNT(*) AS total FROM users WHERE anonymous = 0', [])).total,
  anonymous: (await db.get('SELECT COUNT(*) AS total FROM users WHERE anonymous = 1', [])).total,
  admins: (await db.get("SELECT COUNT(*) AS total FROM users WHERE role IN ('ADMIN','SUPER_ADMIN')", [])).total,
  disabled: (await db.get("SELECT COUNT(*) AS total FROM users WHERE status = 'DISABLED'", [])).total,
  newToday: (await db.get('SELECT COUNT(*) AS total FROM users WHERE anonymous = 0 AND created_at >= ?', [new Date(Date.now() - 86_400_000).toISOString(),])).total,
});

export const getUser = async (id) => {
  const row = (await db.get('SELECT * FROM users WHERE id = ?', [id]));
  return row ? rowToUser(row) : null;
};

export const updateUser = async (id, { displayName, profile }) => {
  const existing = await getUser(id);
  if (!existing) return null;

  const merged = {
    ...existing.profile,
    ...profile,
    notifications: { ...existing.profile.notifications, ...(profile?.notifications ?? {}) },
  };

  (await db.run('UPDATE users SET display_name = ?, profile = ?, updated_at = ? WHERE id = ?', [bind(displayName ?? existing.displayName),
    toJson(merged),
    nowIso(),
    id,]));
  return await getUser(id);
};

export const listUsers = async () => (await db.all('SELECT * FROM users', [])).map(rowToUser);

// --- devices ---------------------------------------------------------------

export const saveDevice = async ({ token, userId, platform }) => {
  const timestamp = nowIso();
  (await db.run(`
    INSERT INTO devices (token, user_id, platform, created_at, last_seen)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, last_seen = excluded.last_seen
  `, [bind(token), bind(userId), bind(platform), timestamp, timestamp]));
};

export const devicesForUser = async (userId) =>
  (await db.all('SELECT * FROM devices WHERE user_id = ?', [userId])).map((row) => ({
    token: row.token,
    platform: row.platform,
    lastSeen: row.last_seen,
  }));

export const removeDevice = async (token) => (await db.run('DELETE FROM devices WHERE token = ?', [token])).changes;

// --- saved items -----------------------------------------------------------

export const saveEntity = async (userId, entity, entityId) => {
  (await db.run(`
    INSERT INTO saved_items (user_id, entity, entity_id, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, entity, entity_id) DO NOTHING
  `, [userId, entity, entityId, nowIso()]));
};

export const unsaveEntity = async (userId, entity, entityId) =>
  (await db.run('DELETE FROM saved_items WHERE user_id = ? AND entity = ? AND entity_id = ?', [userId, entity, entityId]))
    .changes;

export const savedIds = async (userId, entity) =>
  (await db.all('SELECT entity_id FROM saved_items WHERE user_id = ? AND entity = ? ORDER BY created_at DESC', [userId, entity]))
    .map((row) => row.entity_id);

// --- conversation history --------------------------------------------------

export const appendMessage = async ({ userId, thread = 'coach', role, content, meta = {} }) => {
  const id = crypto.randomUUID();
  (await db.run('INSERT INTO messages (id, user_id, thread, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id,
    userId,
    thread,
    role,
    content,
    toJson(meta),
    nowIso(),]));
  return id;
};

export const threadMessages = async (userId, thread = 'coach', limit = 40) =>
  (await db.all('SELECT * FROM messages WHERE user_id = ? AND thread = ? ORDER BY created_at DESC LIMIT ?', [userId, thread, limit]))
    .reverse()
    .map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      meta: fromJson(row.meta, {}),
      createdAt: row.created_at,
    }));

export const clearThread = async (userId, thread) =>
  (await db.run('DELETE FROM messages WHERE user_id = ? AND thread = ?', [userId, thread])).changes;
