import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { forPostgres } from '../src/db.js';

/**
 * The SQL in this codebase is written once, in SQLite's dialect, and translated
 * for Postgres at the moment it is sent. Everything else about the two backends
 * is identical, so this translation is where a production-only bug would hide.
 *
 * These run against no database at all — they check the string that would be
 * sent. Agreement between the two backends at runtime is proved by running the
 * whole suite with DATABASE_URL set (`npm run test:pg`).
 */

describe('placeholder translation', () => {
  test('numbers each ? in order', () => {
    assert.equal(
      forPostgres('INSERT INTO users (id, email, role) VALUES (?, ?, ?)'),
      'INSERT INTO users (id, email, role) VALUES ($1, $2, $3)',
    );
  });

  test('keeps counting across a WHERE clause and the paging tail', () => {
    assert.equal(
      forPostgres('SELECT * FROM items WHERE kind = ? AND status = ? LIMIT ? OFFSET ?'),
      'SELECT * FROM items WHERE kind = $1 AND status = $2 LIMIT $3 OFFSET $4',
    );
  });

  test('leaves SQL without placeholders untouched', () => {
    const sql = 'SELECT COUNT(*) AS total FROM jobs';
    assert.equal(forPostgres(sql), sql);
  });
});

describe('case-insensitive matching', () => {
  /**
   * The one that matters most. SQLite's LIKE ignores case for ASCII, Postgres's
   * does not — so a search for "apprenticeship" would quietly stop matching
   * "Apprenticeship" in production while every local test still passed.
   */
  test('LIKE becomes ILIKE', () => {
    assert.equal(
      forPostgres('SELECT * FROM items WHERE headline LIKE ?'),
      'SELECT * FROM items WHERE headline ILIKE $1',
    );
  });

  test('translates every LIKE in a multi-column search', () => {
    assert.equal(
      forPostgres('SELECT * FROM sources WHERE (name LIKE ? OR base_url LIKE ? OR publisher LIKE ?)'),
      'SELECT * FROM sources WHERE (name ILIKE $1 OR base_url ILIKE $2 OR publisher ILIKE $3)',
    );
  });

  test('does not touch a column whose name merely contains "like"', () => {
    assert.equal(forPostgres('SELECT likes FROM items'), 'SELECT likes FROM items');
  });

  test('is idempotent — an already-translated ILIKE is left alone', () => {
    assert.equal(forPostgres('SELECT * FROM items WHERE title ILIKE ?'), 'SELECT * FROM items WHERE title ILIKE $1');
  });
});

describe('constructs shared by both backends are passed through unchanged', () => {
  test('ON CONFLICT ... DO UPDATE with excluded', () => {
    const sql = 'INSERT INTO devices (token) VALUES (?) ON CONFLICT (token) DO UPDATE SET last_seen = excluded.last_seen';
    assert.equal(
      forPostgres(sql),
      'INSERT INTO devices (token) VALUES ($1) ON CONFLICT (token) DO UPDATE SET last_seen = excluded.last_seen',
    );
  });

  test('COALESCE, substr and aggregate functions', () => {
    const sql = "SELECT substr(created_at, 1, 10) AS day, COALESCE(SUM(items_new), 0) AS total FROM scrape_runs WHERE started_at >= ? GROUP BY day";
    assert.equal(
      forPostgres(sql),
      "SELECT substr(created_at, 1, 10) AS day, COALESCE(SUM(items_new), 0) AS total FROM scrape_runs WHERE started_at >= $1 GROUP BY day",
    );
  });
});
