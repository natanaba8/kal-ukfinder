import fs from 'node:fs';
import path from 'node:path';

import { config } from './config.js';
import { createLogger } from './logger.js';
import { migrations } from './migrations/index.js';
import { runMigrations } from './migrations/runner.js';

const log = createLogger('db');

/**
 * One data layer, two backends.
 *
 *   Postgres (Supabase)  when DATABASE_URL is set — production
 *   SQLite (node:sqlite) otherwise — local development and the test suite
 *
 * The queries are written once, in a portable subset: `?` placeholders, ISO
 * strings for timestamps, integer 0/1 for flags, and standard
 * `ON CONFLICT ... excluded`. This adapter normalises the two things that are
 * genuinely not portable:
 *
 *   - placeholders   `?` becomes `$1, $2, …` for Postgres
 *   - case-insensitive matching: SQLite's LIKE ignores case, Postgres's does
 *     not, so LIKE becomes ILIKE. Without this every search filter would
 *     silently stop matching in production.
 *
 * Keeping SQLite working is deliberate: the test suite runs with no database
 * server, and `npm run dev` needs nothing installed. The same suite can be run
 * against Postgres by setting DATABASE_URL, which is what proves the two
 * backends actually agree.
 */

export const usePostgres = Boolean(config.databaseUrl);
export const dialect = usePostgres ? 'postgres' : 'sqlite';

/** `?` → `$1, $2, …`. Postgres is the only one that needs it. */
const toPositional = (sql) => {
  let index = 0;
  return sql.replace(/\?/g, () => `$${(index += 1)}`);
};

/** SQLite's LIKE is case-insensitive; Postgres needs ILIKE to match it. */
const toCaseInsensitiveLike = (sql) => sql.replace(/\bLIKE\b/gi, 'ILIKE');

/**
 * Exported for `test/dialect.test.js`. This translation is the only thing
 * standing between a query that works locally and one that fails in production,
 * and it is the one part of the adapter that can be tested without a server.
 */
export const forPostgres = (sql) => toPositional(toCaseInsensitiveLike(sql));

let backend;

// --------------------------------------------------------------------------
// Postgres
// --------------------------------------------------------------------------

const createPostgresBackend = async () => {
  const { default: pg } = await import('pg');

  // Postgres returns COUNT(*) as int8, and node-postgres hands int8 back as a
  // *string* to avoid precision loss. Every `total` in this codebase would then
  // be "12" rather than 12 — breaking Math.ceil(total / limit), JSON payloads
  // and every numeric comparison. Our counts never approach 2^53, so parse
  // them as numbers and keep both backends returning the same types.
  pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
  // NUMERIC comes back as a string for the same reason; salaries are small.
  pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

  // Supabase terminates TLS with its own certificate chain; verifying it needs
  // their CA bundle, which is not worth shipping for a connection that is
  // already encrypted. Anything else uses normal verification.
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    // Applied to every connection the pool opens, including ones it opens later.
    options: config.databaseSchema ? `-c search_path="${config.databaseSchema}"` : undefined,
    // Serverless invocations are short-lived and numerous, so hold very few
    // connections each. Supabase's transaction pooler multiplexes the rest.
    max: config.databaseMaxConnections,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });

  pool.on('error', (error) => log.error(`idle client error: ${error.message}`));

  const query = async (sql, params = []) => pool.query(forPostgres(sql), params);

  return {
    dialect: 'postgres',
    async all(sql, params) {
      return (await query(sql, params)).rows;
    },
    async get(sql, params) {
      return (await query(sql, params)).rows[0];
    },
    async run(sql, params) {
      const result = await query(sql, params);
      return { changes: result.rowCount ?? 0 };
    },
    async exec(sql) {
      // Statements here are DDL written by us, never user input.
      await pool.query(toCaseInsensitiveLike(sql));
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const scoped = {
          all: async (sql, params = []) => (await client.query(forPostgres(sql), params)).rows,
          get: async (sql, params = []) => (await client.query(forPostgres(sql), params)).rows[0],
          run: async (sql, params = []) => ({
            changes: (await client.query(forPostgres(sql), params)).rowCount ?? 0,
          }),
          exec: async (sql) => {
            await client.query(toCaseInsensitiveLike(sql));
          },
        };
        const result = await fn(scoped);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
};

// --------------------------------------------------------------------------
// SQLite
// --------------------------------------------------------------------------

const createSqliteBackend = async () => {
  const { DatabaseSync } = await import('node:sqlite');

  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const handle = new DatabaseSync(config.dbPath);

  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec('PRAGMA foreign_keys = ON');

  // node:sqlite is synchronous; the async signatures keep one call shape for
  // both backends so no caller has to know which one it is talking to.
  const self = {
    dialect: 'sqlite',
    async all(sql, params = []) {
      return handle.prepare(sql).all(...params);
    },
    async get(sql, params = []) {
      return handle.prepare(sql).get(...params);
    },
    async run(sql, params = []) {
      const result = handle.prepare(sql).run(...params);
      return { changes: Number(result.changes ?? 0) };
    },
    async exec(sql) {
      handle.exec(sql);
    },
    async tx(fn) {
      handle.exec('BEGIN');
      try {
        const result = await fn(self);
        handle.exec('COMMIT');
        return result;
      } catch (error) {
        handle.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      handle.close();
    },
  };

  return self;
};

// --------------------------------------------------------------------------

/**
 * Opens the database and applies migrations. Idempotent — repeated calls
 * return the same connection, which matters in serverless where a warm
 * instance handles many requests.
 */
let ready;

export const initDb = async () => {
  ready ??= (async () => {
    backend = usePostgres ? await createPostgresBackend() : await createSqliteBackend();

    if (usePostgres && config.databaseSchema) {
      // The pool already points `search_path` at this schema; creating it does
      // not depend on that, so the order is safe.
      if (config.databaseSchemaReset) {
        await backend.exec(`DROP SCHEMA IF EXISTS "${config.databaseSchema}" CASCADE`);
      }
      await backend.exec(`CREATE SCHEMA IF NOT EXISTS "${config.databaseSchema}"`);
      log.info(`schema "${config.databaseSchema}"${config.databaseSchemaReset ? ' (reset)' : ''}`);
    }

    const result = await runMigrations(backend, migrations);
    log.info(
      `${dialect}${usePostgres ? '' : ` (${config.dbPath})`} — ${result.applied} migration(s) applied, ${result.total} total`,
    );

    return backend;
  })();

  return ready;
};

/** The query facade. Every store module talks to this and nothing else. */
export const db = {
  all: async (sql, params) => (await initDb()).all(sql, params),
  get: async (sql, params) => (await initDb()).get(sql, params),
  run: async (sql, params) => (await initDb()).run(sql, params),
  exec: async (sql) => (await initDb()).exec(sql),
  tx: async (fn) => (await initDb()).tx(fn),
  close: async () => {
    if (!ready) return;
    const instance = await ready;
    await instance.close();
    ready = undefined;
  },
};

export const nowIso = () => new Date().toISOString();

/** JSON helpers — both backends store arrays and objects as text. */
export const toJson = (value) => JSON.stringify(value ?? null);
export const fromJson = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

/**
 * Normalise a bound value. node:sqlite rejects `undefined` and booleans
 * outright; Postgres accepts booleans but the schema uses integer flags, so
 * both get 0/1 for consistency.
 */
/**
 * Did this error come from a unique constraint?
 *
 * The two backends report it completely differently. SQLite raises
 * `UNIQUE constraint failed: sources.id`; Postgres raises
 * `duplicate key value violates unique constraint "sources_endpoint"` and sets
 * SQLSTATE 23505. Matching on the word "UNIQUE" therefore works only on SQLite,
 * which turned a deliberate 409 into a 500 on Supabase.
 */
export const isUniqueViolation = (error) => {
  if (!error) return false;
  if (error.code === '23505') return true; // Postgres unique_violation
  return /UNIQUE constraint failed/i.test(String(error.message ?? ''));
};

export const bind = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
};

/** Counts come back as strings from Postgres and numbers from SQLite. */
export const count = (value) => Number(value ?? 0);
