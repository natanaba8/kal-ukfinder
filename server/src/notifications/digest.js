import crypto from 'node:crypto';

import { scoreJobLexically, writeDigestLine } from '../ai/coach.js';
import { bind, db, nowIso, toJson } from '../db.js';
import { createLogger } from '../logger.js';
import { rankedForProfile } from '../store/items.js';
import { listJobs } from '../store/jobs.js';
import { devicesForUser, listUsers } from '../store/users.js';
import { sendPush } from './push.js';

const log = createLogger('digest');

/** Current hour in UK local time, regardless of where the server runs. */
export const ukHour = (date = new Date()) =>
  Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: 'numeric',
      hour12: false,
    }).format(date),
  ) % 24;

const recordNotification = async ({ userId, title, body, data, status }) => {
  const id = crypto.randomUUID();
  (await db.run('INSERT INTO notifications (id, user_id, title, body, data, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id,
    userId,
    bind(title),
    bind(body),
    toJson(data ?? {}),
    status,
    nowIso()]));
  return id;
};

export const notificationHistory = async (userId, limit = 30) =>
  (await db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]))
    .map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      data: JSON.parse(row.data || '{}'),
      status: row.status,
      createdAt: row.created_at,
    }));

/**
 * Build one person's briefing: the highest-scoring recent items for their
 * topics, plus their best job matches if job alerts are on.
 */
export const buildDigest = async (user, { sinceHours = 24, maxItems = 5 } = {}) => {
  const since = Date.now() - sinceHours * 3_600_000;

  const items = (await rankedForProfile(user.profile, { limit: 40 }))
    .filter((item) => new Date(item.publishedAt).getTime() >= since)
    .slice(0, maxItems);

  const jobs = user.profile.notifications?.jobAlerts
    ? (await listJobs({
        location: user.profile.remoteOnly ? undefined : user.profile.location || undefined,
        remoteOnly: user.profile.remoteOnly,
        salaryMin: user.profile.salaryMin ?? undefined,
        limit: 40,
      }))
        .map((job) => ({ job, match: scoreJobLexically(job, user.profile) }))
        .filter((entry) => entry.match.score >= 35 && new Date(entry.job.postedAt).getTime() >= since)
        .sort((a, b) => b.match.score - a.match.score)
        .slice(0, 3)
        .map((entry) => ({ ...entry.job, matchScore: entry.match.score }))
    : [];

  return { items, jobs };
};

/**
 * Send the daily briefing to everyone whose chosen hour is the current UK hour.
 * `force` ignores the hour (used by the manual /test endpoint and CLI script).
 */
export const runDigest = async ({ force = false, userId = null } = {}) => {
  const hour = ukHour();
  const users = (userId ? [(await listUsers()).find((user) => user.id === userId)].filter(Boolean) : await listUsers()).filter(
    (user) => {
      const preferences = user.profile.notifications ?? {};
      if (!preferences.enabled) return false;
      if (force) return true;
      return Number(preferences.digestHour ?? 8) === hour;
    },
  );

  const summary = { hour, considered: users.length, sent: 0, failed: 0, empty: 0 };

  for (const user of users) {
    const { items, jobs } = await buildDigest(user);

    if (items.length === 0 && jobs.length === 0) {
      summary.empty += 1;
      continue;
    }

    const copy = await writeDigestLine({ items, profile: user.profile });
    const body = jobs.length > 0 ? `${copy.body} · ${jobs.length} new job match${jobs.length === 1 ? '' : 'es'}` : copy.body;

    const devices = await devicesForUser(user.id);
    const data = {
      type: 'digest',
      itemIds: items.map((item) => item.id),
      jobIds: jobs.map((job) => job.id),
    };

    if (devices.length === 0) {
      // Still record it — the app shows the history in-app on next open.
      await recordNotification({ userId: user.id, title: copy.title, body, data, status: 'skipped' });
      summary.empty += 1;
      continue;
    }

    const result = await sendPush(
      devices.map((device) => ({ to: device.token, title: copy.title, body, data })),
    );

    await recordNotification({
      userId: user.id,
      title: copy.title,
      body,
      data,
      status: result.sent > 0 ? 'sent' : 'failed',
    });

    summary.sent += result.sent;
    summary.failed += result.failed;
  }

  log.info(`hour ${hour}: ${summary.sent} sent, ${summary.failed} failed, ${summary.empty} with nothing to say`);
  return summary;
};
