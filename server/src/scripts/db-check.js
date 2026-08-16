/**
 * Verify the configured database end to end: connect, migrate, write, read back,
 * clean up. Run it after setting DATABASE_URL to confirm Supabase is reachable
 * and that the schema applied, before deploying anything that depends on it.
 *
 *   npm run db:check          (from the server folder)
 *
 * With no DATABASE_URL it checks the local SQLite file instead, so the same
 * command is useful in both directions.
 */
import crypto from 'node:crypto';

import { config } from '../config.js';
import { db, dialect, initDb, usePostgres } from '../db.js';

const line = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);

const TABLES = ['users', 'sessions', 'items', 'jobs', 'sources', 'scrape_runs', 'scrape_errors', 'settings'];

const run = async () => {
  console.log(`\nKal-UKFinder database check — ${dialect}\n`);

  if (usePostgres) {
    // Never print the password. Show only enough to confirm the right endpoint.
    const url = new URL(config.databaseUrl);
    line('host', url.hostname);
    line('port', `${url.port}${url.port === '6543' ? '  (transaction pooler)' : '  (direct — prefer 6543)'}`);
    line('database', url.pathname.replace(/^\//, ''));
    line('schema', config.databaseSchema || 'public');
  } else {
    line('file', config.dbPath);
  }

  const started = Date.now();
  await initDb();
  line('connect + migrate', `${Date.now() - started}ms`);

  console.log('\n  rows per table');
  for (const table of TABLES) {
    const { total } = await db.get(`SELECT COUNT(*) AS total FROM ${table}`, []);
    // A string here would mean the int8 parser is not applied — see db.js.
    const suspicious = typeof total !== 'number' ? '  ⚠ not a number' : '';
    line(`  ${table}`, `${total}${suspicious}`);
  }

  // A real round trip through the adapter: placeholders, an upsert, a
  // case-insensitive search, and a delete.
  console.log('\n  round trip');
  const probe = `db-check-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [probe, '"MiXedCase"', now]);
  line('  insert', 'ok');

  const read = await db.get('SELECT value FROM settings WHERE key = ?', [probe]);
  line('  read back', read?.value === '"MiXedCase"' ? 'ok' : `MISMATCH (${read?.value})`);

  const found = await db.all('SELECT key FROM settings WHERE value LIKE ?', ['%mixedcase%']);
  line('  case-insensitive LIKE', found.some((row) => row.key === probe) ? 'ok' : 'FAILED — search would miss rows');

  const { changes } = await db.run('DELETE FROM settings WHERE key = ?', [probe]);
  line('  delete', changes === 1 ? 'ok' : `expected 1 row, got ${changes}`);

  await db.close();
  console.log('\n  all checks completed\n');
};

run().catch((error) => {
  console.error(`\n  FAILED: ${error.message}\n`);
  if (/self.signed|certificate/i.test(error.message)) {
    console.error('  Set DATABASE_SSL=true (the default) so the Supabase certificate is accepted.\n');
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i.test(error.message)) {
    console.error('  Check the host and that you used the pooler string (port 6543), not the direct one.\n');
  }
  if (/password authentication|SASL/i.test(error.message)) {
    console.error('  The password in DATABASE_URL is wrong, or it needs URL-encoding if it contains @ : / or ?.\n');
  }
  process.exitCode = 1;
});
