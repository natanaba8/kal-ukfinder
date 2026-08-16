import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Give a test file a database of its own, before anything imports `src/db.js`.
 *
 * On SQLite that is a fresh file in a temp directory. With DATABASE_URL set the
 * same suite runs against real Postgres, where the equivalent of "a fresh file"
 * is a schema of its own — dropped and recreated on connect, so a rerun after a
 * failure starts clean and the files can still run in parallel.
 *
 * Returns the temp directory so the caller's `after` hook can remove it.
 */
export const isolateDatabase = (name) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `kal-ukfinder-${name}-`));

  process.env.DB_PATH = path.join(tempDir, 'test.db');
  process.env.INGEST_ENABLED = 'false';
  process.env.DIGEST_ENABLED = 'false';

  if (process.env.DATABASE_URL) {
    process.env.DATABASE_SCHEMA = `kal_test_${name}`;
    process.env.DATABASE_SCHEMA_RESET = 'true';
  }

  return tempDir;
};
