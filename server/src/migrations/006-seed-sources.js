import { FEEDS } from '../sources/feeds.js';

const origin = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
};

const INSERT = `
  INSERT INTO sources (
    id, name, publisher, base_url, content_type, method, resolved_method, rss_url,
    api_provider, api_url, trust, default_topics, default_audience, active, moderation,
    scrape_interval_minutes, max_items_per_run, last_status, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT DO NOTHING
`;

/**
 * Moves the 26 hardcoded feeds into the `sources` table.
 *
 * Their ids are preserved, which matters: `items.source_id` already stores the
 * feed id, so existing rows line up with their new source row and the admin
 * panel's per-source counts are correct from day one.
 *
 * Idempotent — re-running inserts nothing because of the endpoint index.
 */
export default {
  id: 6,
  name: 'seed-sources',
  async up(db) {
    const now = new Date().toISOString();

    for (const feed of FEEDS) {
      await db.run(INSERT, [
        feed.id,
        feed.name,
        feed.publisher,
        origin(feed.url),
        'POLICY',
        'RSS',
        'RSS',
        feed.url,
        null,
        null,
        feed.kind === 'policy' ? 'official' : 'trusted',
        JSON.stringify(feed.hints ?? []),
        JSON.stringify(feed.audience ?? []),
        1,
        'AUTO_PUBLISH',
        30,
        15,
        'never',
        'seed',
        now,
        now,
      ]);
    }

    // The job boards are API sources so they appear in the admin panel too.
    // They stay dormant unless credentials are configured — the engine checks.
    const providers = [
      { id: 'adzuna', name: 'Adzuna', publisher: 'Adzuna', url: 'https://api.adzuna.com', provider: 'adzuna' },
      { id: 'reed', name: 'Reed', publisher: 'Reed.co.uk', url: 'https://www.reed.co.uk/api', provider: 'reed' },
      {
        id: 'sample',
        name: 'Sample vacancies',
        publisher: 'Bundled with the app',
        url: 'https://findajob.dwp.gov.uk',
        provider: 'sample',
      },
    ];

    for (const provider of providers) {
      await db.run(INSERT, [
        provider.id,
        provider.name,
        provider.publisher,
        provider.url,
        'JOB',
        'API',
        'API',
        null,
        provider.provider,
        provider.url,
        'trusted',
        '[]',
        '[]',
        1,
        'AUTO_PUBLISH',
        60,
        50,
        'never',
        'seed',
        now,
        now,
      ]);
    }

    // Backfill the foreign key on content collected before sources existed.
    await db.exec(`
      UPDATE items SET db_source_id = source_id
       WHERE db_source_id IS NULL
         AND source_id IN (SELECT id FROM sources);

      UPDATE jobs SET db_source_id = source
       WHERE db_source_id IS NULL
         AND source IN (SELECT id FROM sources);
    `);
  },
};
