/**
 * Per-source run history and error detail (pr.md §33).
 *
 * The old single-row-per-ingest `ingest_runs` table stays for backwards
 * compatibility; these tables record one row per source per run, which is what
 * the admin panel's log view needs.
 */
export default {
  id: 5,
  name: 'scrape-logs',
  async up(db) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS scrape_runs (
        id               TEXT PRIMARY KEY,
        source_id        TEXT,
        started_at       TEXT NOT NULL,
        finished_at      TEXT,
        status           TEXT NOT NULL DEFAULT 'running', -- running | success | failed | skipped
        method           TEXT,
        items_found      INTEGER NOT NULL DEFAULT 0,
        items_new        INTEGER NOT NULL DEFAULT 0,
        items_updated    INTEGER NOT NULL DEFAULT 0,
        items_duplicate  INTEGER NOT NULL DEFAULT 0,
        error_count      INTEGER NOT NULL DEFAULT 0,
        duration_ms      INTEGER,
        triggered_by     TEXT NOT NULL DEFAULT 'scheduler', -- scheduler | admin | cli
        FOREIGN KEY (source_id) REFERENCES sources (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS scrape_runs_source ON scrape_runs (source_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS scrape_runs_started ON scrape_runs (started_at DESC);

      CREATE TABLE IF NOT EXISTS scrape_errors (
        id         TEXT PRIMARY KEY,
        run_id     TEXT,
        source_id  TEXT,
        stage      TEXT NOT NULL,   -- fetch | parse | normalise | store | robots
        message    TEXT NOT NULL,
        detail     TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES scrape_runs (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS scrape_errors_run ON scrape_errors (run_id);
      CREATE INDEX IF NOT EXISTS scrape_errors_source ON scrape_errors (source_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  },
};
