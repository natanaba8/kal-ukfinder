import { createLogger } from '../logger.js';

const log = createLogger('migrate');

/**
 * Migrations are plain modules exporting `{ id, name, up(db) }`, applied in id
 * order inside a transaction and recorded in `schema_migrations`.
 *
 * pr.md §29 and §42.21 ask for migrations rather than hand-edited databases.
 * Every migration must be safe to run against a database that already contains
 * the pre-migration schema, which is why 001 re-declares it with IF NOT EXISTS.
 */
export const runMigrations = (db, migrations) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((row) => row.id));
  const pending = [...migrations].sort((a, b) => a.id - b.id).filter((migration) => !applied.has(migration.id));

  if (pending.length === 0) return { applied: 0, total: migrations.length };

  for (const migration of pending) {
    db.exec('BEGIN');
    try {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
        migration.id,
        migration.name,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
      log.info(`applied ${String(migration.id).padStart(3, '0')}_${migration.name}`);
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${migration.id}_${migration.name} failed: ${error.message}`, { cause: error });
    }
  }

  return { applied: pending.length, total: migrations.length };
};

/** `ALTER TABLE ... ADD COLUMN` is not idempotent in SQLite — check first. */
export const addColumn = (db, table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((entry) => entry.name === column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
};
