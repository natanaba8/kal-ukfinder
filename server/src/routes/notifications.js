import { Router } from 'express';
import { z } from 'zod';

import { buildDigest, notificationHistory, runDigest, ukHour } from '../notifications/digest.js';
import { sendPush } from '../notifications/push.js';
import { optionalAuth } from '../auth/guard.js';
import { devicesForUser, getUser } from '../store/users.js';

export const notificationsRouter = Router();

notificationsRouter.use(optionalAuth);

/** A signed-in user may only act on their own notifications. */
const ensureSelf = (request, response, next) => {
  if (request.auth && request.auth.userId !== request.params.userId) {
    return response.status(403).json({ error: 'That is not your account', code: 'FORBIDDEN' });
  }
  return next();
};

/** What the next digest would contain, without sending it. */
notificationsRouter.get('/notifications/:userId/preview', ensureSelf, async (request, response) => {
  const user = await getUser(request.params.userId);
  if (!user) return response.status(404).json({ error: 'User not found' });

  const { items, jobs } = await buildDigest(user, { sinceHours: 48 });
  return response.json({
    scheduledHour: user.profile.notifications?.digestHour ?? 8,
    currentUkHour: ukHour(),
    enabled: user.profile.notifications?.enabled !== false,
    devices: (await devicesForUser(user.id)).length,
    items,
    jobs,
  });
});

notificationsRouter.get('/notifications/:userId', ensureSelf, async (request, response) => {
  const user = await getUser(request.params.userId);
  if (!user) return response.status(404).json({ error: 'User not found' });
  return response.json({ notifications: await notificationHistory(user.id) });
});

/** Fire this user's digest immediately — used by the "Send me a test" button. */
notificationsRouter.post('/notifications/:userId/test', ensureSelf, async (request, response) => {
  const user = await getUser(request.params.userId);
  if (!user) return response.status(404).json({ error: 'User not found' });

  const devices = await devicesForUser(user.id);
  if (devices.length === 0) {
    return response.status(409).json({
      error: 'No device registered for push. Open the app on a phone and allow notifications first.',
    });
  }

  const result = await runDigest({ force: true, userId: user.id });
  return response.json(result);
});

/** Direct push, mostly for debugging the pipeline end to end. */
notificationsRouter.post('/notifications/:userId/push', ensureSelf, async (request, response) => {
  const body = z
    .object({ title: z.string().max(80), body: z.string().max(200), data: z.record(z.string(), z.unknown()).optional() })
    .parse(request.body);

  const user = await getUser(request.params.userId);
  if (!user) return response.status(404).json({ error: 'User not found' });

  const devices = await devicesForUser(user.id);
  const result = await sendPush(
    devices.map((device) => ({ to: device.token, title: body.title, body: body.body, data: body.data })),
  );
  return response.json(result);
});

/** Admin: run the hourly sweep now. */
notificationsRouter.post('/admin/digest', async (request, response) => {
  response.json(await runDigest({ force: Boolean(request.body?.force) }));
});
