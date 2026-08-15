import { addColumn } from './runner.js';

/**
 * Brings the stored content in line with pr.md §14 (jobs) and §15 (policies),
 * and adds the moderation flags §26/§34 need.
 *
 * `status` defaults to 'published' so everything already collected stays
 * visible — moderation is opt-in per source.
 */
export default {
  id: 4,
  name: 'content-fields',
  up(db) {
    // --- jobs (§14) --------------------------------------------------------
    addColumn(db, 'jobs', 'db_source_id', 'TEXT REFERENCES sources (id)');
    addColumn(db, 'jobs', 'employment_type', 'TEXT');
    addColumn(db, 'jobs', 'requirements', 'TEXT');
    addColumn(db, 'jobs', 'deadline', 'TEXT');
    addColumn(db, 'jobs', 'source_url', 'TEXT');
    addColumn(db, 'jobs', 'content_hash', 'TEXT');
    addColumn(db, 'jobs', 'status', "TEXT NOT NULL DEFAULT 'published'");
    addColumn(db, 'jobs', 'featured', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'jobs', 'updated_at', 'TEXT');

    // --- items / policies (§15) -------------------------------------------
    addColumn(db, 'items', 'db_source_id', 'TEXT REFERENCES sources (id)');
    addColumn(db, 'items', 'category', 'TEXT');
    addColumn(db, 'items', 'source_url', 'TEXT');
    addColumn(db, 'items', 'content_hash', 'TEXT');
    addColumn(db, 'items', 'status', "TEXT NOT NULL DEFAULT 'published'");
    addColumn(db, 'items', 'featured', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'items', 'updated_at', 'TEXT');

    db.exec(`
      CREATE INDEX IF NOT EXISTS jobs_content_hash ON jobs (content_hash);
      CREATE INDEX IF NOT EXISTS jobs_location ON jobs (location);
      CREATE INDEX IF NOT EXISTS jobs_company ON jobs (company);
      CREATE INDEX IF NOT EXISTS jobs_deadline ON jobs (deadline);
      CREATE INDEX IF NOT EXISTS jobs_source ON jobs (db_source_id);
      CREATE INDEX IF NOT EXISTS jobs_status ON jobs (status, posted_at DESC);

      CREATE INDEX IF NOT EXISTS items_content_hash ON items (content_hash);
      CREATE INDEX IF NOT EXISTS items_category ON items (category);
      CREATE INDEX IF NOT EXISTS items_source ON items (db_source_id);
      CREATE INDEX IF NOT EXISTS items_status ON items (status, published_at DESC);
    `);
  },
};
