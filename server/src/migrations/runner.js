import { createLogger } from '../logger.js';

const log = createLogger('migrate');

/**
 * Migrations are plain modules exporting `{ id, name, up(db) }`, applied in id
 * order inside a transaction and recorded in `schema_migrations`.
 *
 * `db` is the dialect adapter, so a migration is written once and runs against
 * either backend. Migration 001 re-declares the pre-migration schema with
 * IF NOT EXISTS, which is what lets an existing SQLite database be adopted
 * rather than rebuilt.
 */
/**
 * Arbitrary but fixed key for the Postgres advisory lock below. Any number works
 * as long as it never changes, since it only has to be the same across instances.
 */
const MIGRATION_LOCK_KEY = 4_815_162_342;

export const runMigrations = async (db, migrations) => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  /** Which migrations are outstanding, according to `runner`. */
  const pendingFor = async (runner) => {
    const rows = await runner.all('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map((row) => Number(row.id)));
    return [...migrations].sort((a, b) => a.id - b.id).filter((entry) => !applied.has(entry.id));
  };

  const record = async (runner, migration) => {
    await migration.up(runner);
    await runner.run('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)', [
      migration.id,
      migration.name,
      new Date().toISOString(),
    ]);
    log.info(`applied ${String(migration.id).padStart(3, '0')}_${migration.name}`);
  };

  const failed = (migration, error) =>
    new Error(`migration ${migration.id}_${migration.name} failed: ${error.message}`, { cause: error });

  // A serverless deploy can cold-start several instances at once, each of which
  // would read an empty `schema_migrations` and try to create the same tables.
  // Postgres has transactional DDL, so take an advisory lock and do the whole
  // run in one transaction — the losers block, then re-read and find nothing
  // left to do. SQLite needs none of this: one process, holding a file lock.
  if (db.dialect === 'postgres') {
    return db.tx(async (tx) => {
      await tx.run('SELECT pg_advisory_xact_lock(?)', [MIGRATION_LOCK_KEY]);

      const pending = await pendingFor(tx);
      for (const migration of pending) {
        try {
          await record(tx, migration);
        } catch (error) {
          throw failed(migration, error);
        }
      }
      return { applied: pending.length, total: migrations.length };
    });
  }

  const pending = await pendingFor(db);
  for (const migration of pending) {
    try {
      await db.tx((tx) => record(tx, migration));
    } catch (error) {
      throw failed(migration, error);
    }
  }

  return { applied: pending.length, total: migrations.length };
};

/**
 * `ALTER TABLE ... ADD COLUMN` is not idempotent in either backend, so check
 * first. `information_schema` is standard and both support it.
 *
 * The `table_schema` filter is essential, not tidiness. Supabase ships its own
 * `auth.users` table, which has an `email` column. Without the filter this asks
 * "does any table called users anywhere have an email column?", gets yes from
 * `auth.users`, and silently skips adding `email` to *our* `public.users` — so
 * migration 002 appeared to succeed and the next statement failed with
 * `column "email" does not exist`.
 */
export const addColumn = async (db, table, column, definition) => {
  const existing = await db.all(
    'SELECT column_name FROM information_schema.columns WHERE table_name = ? AND table_schema = current_schema()',
    [table],
  ).catch(() => null);

  if (existing) {
    if (existing.some((row) => row.column_name === column)) return false;
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  }

  // SQLite has no information_schema — fall back to PRAGMA.
  const columns = await db.all(`PRAGMA table_info(${table})`);
  if (columns.some((entry) => entry.name === column)) return false;

  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
};
