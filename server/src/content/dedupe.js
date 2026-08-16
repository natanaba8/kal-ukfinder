import { db } from '../db.js';
import { normaliseTitle } from './normalise.js';

/**
 * Duplicate detection (pr.md §16).
 *
 * Three passes, cheapest first:
 *   1. the original URL — the same page collected twice
 *   2. the content hash — normalised title + organisation, which catches the
 *      same vacancy syndicated across several boards
 *   3. title similarity within a recent window — catches near-identical
 *      wording ("Software Engineer" vs "Software Engineer - Remote")
 *
 * Anything that matches is skipped rather than merged: the first source to
 * publish keeps the record, which preserves attribution.
 */

const SIMILARITY_THRESHOLD = 0.88;
const WINDOW_DAYS = 14;

/** Dice coefficient over character bigrams — cheap and stable for headlines. */
export const similarity = (a, b) => {
  const left = normaliseTitle(a);
  const right = normaliseTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 3 || right.length < 3) return left === right ? 1 : 0;

  const bigrams = (value) => {
    const pairs = new Map();
    for (let index = 0; index < value.length - 1; index += 1) {
      const pair = value.slice(index, index + 2);
      pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
    }
    return pairs;
  };

  const first = bigrams(left);
  const second = bigrams(right);

  let shared = 0;
  for (const [pair, count] of first) {
    const other = second.get(pair);
    if (other) shared += Math.min(count, other);
  }

  return (2 * shared) / (left.length - 1 + (right.length - 1));
};

const windowStart = () => new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

/**
 * @returns {{duplicate: boolean, reason?: string, existingId?: string}}
 */
export const findJobDuplicate = async (candidate) => {
  const byUrl = (await db.get('SELECT id FROM jobs WHERE url = ?', [candidate.url]));
  if (byUrl) return { duplicate: true, reason: 'url', existingId: byUrl.id };

  const byHash = (await db.get('SELECT id FROM jobs WHERE content_hash = ? AND posted_at >= ?', [candidate.contentHash, windowStart()]));
  if (byHash) return { duplicate: true, reason: 'content', existingId: byHash.id };

  // Only compare against the same employer — two employers can advertise the
  // same job title without it being a duplicate.
  if (candidate.company) {
    const sameEmployer = (await db.all('SELECT id, title FROM jobs WHERE company = ? AND posted_at >= ? LIMIT 200', [candidate.company, windowStart()]));

    for (const row of sameEmployer) {
      if (similarity(row.title, candidate.title) >= SIMILARITY_THRESHOLD) {
        return { duplicate: true, reason: 'title', existingId: row.id };
      }
    }
  }

  return { duplicate: false };
};

export const findItemDuplicate = async (candidate) => {
  const byUrl = (await db.get('SELECT id FROM items WHERE url = ?', [candidate.url]));
  if (byUrl) return { duplicate: true, reason: 'url', existingId: byUrl.id };

  const byHash = (await db.get('SELECT id FROM items WHERE content_hash = ? AND published_at >= ?', [candidate.contentHash, windowStart()]));
  if (byHash) return { duplicate: true, reason: 'content', existingId: byHash.id };

  // Across publishers this time: the same announcement reported by several
  // outlets should appear once, from whoever we saw first.
  const recent = (await db.all('SELECT id, title FROM items WHERE published_at >= ? ORDER BY published_at DESC LIMIT 400', [windowStart()]));

  for (const row of recent) {
    if (similarity(row.title, candidate.title) >= SIMILARITY_THRESHOLD) {
      return { duplicate: true, reason: 'title', existingId: row.id };
    }
  }

  return { duplicate: false };
};
