/**
 * The schema as it stood before migrations existed.
 *
 * Everything is IF NOT EXISTS so that an existing kal-ukfinder.db is simply
 * recorded as migrated rather than rebuilt — no data loss on upgrade.
 */
export default {
  id: 1,
  name: 'initial',
  up(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS items (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,
  source_id       TEXT NOT NULL,
  source_name     TEXT NOT NULL,
  source_trust    TEXT NOT NULL DEFAULT 'trusted',
  title           TEXT NOT NULL,
  url             TEXT NOT NULL UNIQUE,
  author          TEXT,
  published_at    TEXT NOT NULL,
  image_url       TEXT,
  raw_summary     TEXT,
  ai_headline     TEXT,
  ai_summary      TEXT,
  ai_impact       TEXT,
  ai_action       TEXT,
  topics          TEXT NOT NULL DEFAULT '[]',
  audience        TEXT NOT NULL DEFAULT '[]',
  region          TEXT NOT NULL DEFAULT 'UK',
  importance      INTEGER NOT NULL DEFAULT 3,
  reading_minutes INTEGER NOT NULL DEFAULT 1,
  ai_model        TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS items_kind_published ON items (kind, published_at DESC);
CREATE INDEX IF NOT EXISTS items_published ON items (published_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id             TEXT PRIMARY KEY,
  source         TEXT NOT NULL,
  external_id    TEXT,
  title          TEXT NOT NULL,
  company        TEXT,
  location       TEXT,
  region         TEXT,
  remote         INTEGER NOT NULL DEFAULT 0,
  salary_min     REAL,
  salary_max     REAL,
  salary_text    TEXT,
  contract_type  TEXT,
  category       TEXT,
  url            TEXT NOT NULL UNIQUE,
  description    TEXT,
  posted_at      TEXT NOT NULL,
  ai_summary     TEXT,
  ai_skills      TEXT NOT NULL DEFAULT '[]',
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS jobs_posted ON jobs (posted_at DESC);
CREATE INDEX IF NOT EXISTS jobs_category ON jobs (category);

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  display_name TEXT,
  profile      TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  platform    TEXT,
  created_at  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS saved_items (
  user_id    TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, entity, entity_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  thread     TEXT NOT NULL DEFAULT 'coach',
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  meta       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS messages_thread ON messages (user_id, thread, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}',
  status     TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id          TEXT PRIMARY KEY,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  stats       TEXT NOT NULL DEFAULT '{}'
);
    `);
  },
};
