import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { config } from './config.js';
import { migrations } from './migrations/index.js';
import { runMigrations } from './migrations/runner.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/**
 * Schema is owned by `src/migrations/` (pr.md §42.21). Migration 001 re-declares
 * the pre-migration schema with IF NOT EXISTS, so an existing database is simply
 * marked as migrated rather than rebuilt.
 */
export const migrationResult = runMigrations(db, migrations);

export const nowIso = () => new Date().toISOString();

/** JSON helpers — SQLite stores arrays/objects as text. */
export const toJson = (value) => JSON.stringify(value ?? null);
export const fromJson = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

/** node:sqlite rejects `undefined` and booleans as bound values. */
export const bind = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
};

export const runInTransaction = (fn) => {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};
