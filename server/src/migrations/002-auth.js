import { addColumn } from './runner.js';

/**
 * Accounts, roles and sessions (pr.md §17, §18, §28).
 *
 * Existing anonymous users keep working: `email` and `password_hash` stay null
 * and `role` defaults to USER, so nothing that relies on a bare user id breaks.
 */
export default {
  id: 2,
  name: 'auth',
  up(db) {
    addColumn(db, 'users', 'email', 'TEXT');
    addColumn(db, 'users', 'password_hash', 'TEXT');
    addColumn(db, 'users', 'role', "TEXT NOT NULL DEFAULT 'USER'");
    addColumn(db, 'users', 'status', "TEXT NOT NULL DEFAULT 'ACTIVE'");
    addColumn(db, 'users', 'email_verified_at', 'TEXT');
    addColumn(db, 'users', 'last_login_at', 'TEXT');
    addColumn(db, 'users', 'anonymous', 'INTEGER NOT NULL DEFAULT 1');

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (email) WHERE email IS NOT NULL;
      CREATE INDEX IF NOT EXISTS users_role ON users (role);

      CREATE TABLE IF NOT EXISTS sessions (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        token_hash  TEXT NOT NULL UNIQUE,
        user_agent  TEXT,
        ip          TEXT,
        created_at  TEXT NOT NULL,
        last_used_at TEXT NOT NULL,
        expires_at  TEXT NOT NULL,
        revoked_at  TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS sessions_token ON sessions (token_hash);
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

      CREATE TABLE IF NOT EXISTS password_resets (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at    TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS password_resets_token ON password_resets (token_hash);
    `);
  },
};
