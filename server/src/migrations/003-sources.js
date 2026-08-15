/**
 * The dynamic source registry (pr.md §6, §8, §42.7).
 *
 * Once this exists an administrator can add a website from the admin panel and
 * the scheduler picks it up — no code change, which is the whole point of the
 * feature. `sources/feeds.js` becomes seed data (migration 006).
 */
export default {
  id: 3,
  name: 'sources',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id                      TEXT PRIMARY KEY,
        name                    TEXT NOT NULL,
        publisher               TEXT,
        base_url                TEXT NOT NULL,
        content_type            TEXT NOT NULL DEFAULT 'POLICY',   -- JOB | POLICY | BOTH
        method                  TEXT NOT NULL DEFAULT 'AUTO',     -- AUTO | RSS | API | SCRAPER
        resolved_method         TEXT,                             -- what AUTO settled on
        rss_url                 TEXT,
        api_url                 TEXT,
        api_provider            TEXT,                             -- adzuna | reed | generic
        scrape_url              TEXT,
        selectors               TEXT NOT NULL DEFAULT '{}',
        request_headers         TEXT NOT NULL DEFAULT '{}',
        trust                   TEXT NOT NULL DEFAULT 'trusted',  -- official | trusted | community
        default_topics          TEXT NOT NULL DEFAULT '[]',
        default_audience        TEXT NOT NULL DEFAULT '[]',
        active                  INTEGER NOT NULL DEFAULT 1,
        moderation              TEXT NOT NULL DEFAULT 'AUTO_PUBLISH', -- or REQUIRE_APPROVAL
        scrape_interval_minutes INTEGER NOT NULL DEFAULT 30,
        max_items_per_run       INTEGER NOT NULL DEFAULT 15,
        last_sync_at            TEXT,
        last_status             TEXT,                             -- success | failed | never
        last_error              TEXT,
        consecutive_failures    INTEGER NOT NULL DEFAULT 0,
        created_by              TEXT,
        created_at              TEXT NOT NULL,
        updated_at              TEXT NOT NULL
      );

      -- Two feeds can share a homepage (BBC business vs BBC education), so
      -- uniqueness is on the endpoint we actually fetch, not the site.
      CREATE UNIQUE INDEX IF NOT EXISTS sources_endpoint
        ON sources (COALESCE(rss_url, api_url, scrape_url, base_url));
      CREATE INDEX IF NOT EXISTS sources_active ON sources (active, content_type);
    `);
  },
};
