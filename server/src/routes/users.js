import { Router } from 'express';
import { z } from 'zod';

import { optionalAuth, requireAuth } from '../auth/guard.js';
import { AUDIENCE_IDS, TOPIC_IDS } from '../constants.js';
import { getItem } from '../store/items.js';
import { getJob } from '../store/jobs.js';
import {
  createUser,
  devicesForUser,
  getUser,
  removeDevice,
  saveDevice,
  saveEntity,
  savedIds,
  unsaveEntity,
  updateUser,
} from '../store/users.js';

export const usersRouter = Router();

const profileSchema = z.object({
  headline: z.string().max(200).optional(),
  sector: z.string().max(120).optional(),
  location: z.string().max(120).optional(),
  experienceLevel: z.string().max(60).optional(),
  skills: z.array(z.string().max(60)).max(40).optional(),
  jobTitles: z.array(z.string().max(120)).max(10).optional(),
  topics: z.array(z.enum(TOPIC_IDS)).max(12).optional(),
  audience: z.array(z.enum(AUDIENCE_IDS)).max(9).optional(),
  salaryMin: z.number().min(0).max(1_000_000).nullable().optional(),
  remoteOnly: z.boolean().optional(),
  rightToWork: z.string().max(120).optional(),
  notifications: z
    .object({
      enabled: z.boolean().optional(),
      digestHour: z.number().int().min(0).max(23).optional(),
      jobAlerts: z.boolean().optional(),
      policyAlerts: z.boolean().optional(),
      weeklyReview: z.boolean().optional(),
    })
    .optional(),
});

/**
 * A signed-in user may only touch their own record. Anonymous records stay
 * reachable by id so the app works before anyone signs up — that id is the
 * only thing that identifies them and it never leaves the device.
 */
const ensureSelf = (request, response, next) => {
  if (!request.auth) {
    const target = getUser(request.params.id);
    if (target && !target.anonymous) {
      return response.status(401).json({ error: 'Sign in to continue', code: 'UNAUTHENTICATED' });
    }
    return next();
  }

  if (request.auth.userId !== request.params.id) {
    return response.status(403).json({ error: 'That is not your account', code: 'FORBIDDEN' });
  }
  return next();
};

/** The authenticated equivalents of the `/users/:id` routes. */
usersRouter.get('/users/me', requireAuth, (request, response) => {
  const user = getUser(request.auth.userId);
  if (!user) return response.status(404).json({ error: 'Account not found' });
  return response.json({ user, devices: devicesForUser(user.id).length });
});

usersRouter.patch('/users/me', requireAuth, (request, response) => {
  const body = z
    .object({ displayName: z.string().max(80).optional(), profile: profileSchema.optional() })
    .parse(request.body ?? {});

  const user = updateUser(request.auth.userId, body);
  if (!user) return response.status(404).json({ error: 'Account not found' });
  return response.json({ user });
});

/** POST /api/users — anonymous account, the id is the app's only credential. */
usersRouter.post('/users', (request, response) => {
  const body = z
    .object({ displayName: z.string().max(80).optional(), profile: profileSchema.optional() })
    .parse(request.body ?? {});

  response.status(201).json({ user: createUser(body) });
});

usersRouter.get('/users/:id', optionalAuth, ensureSelf, (request, response) => {
  const user = getUser(request.params.id);
  if (!user) return response.status(404).json({ error: 'User not found' });
  return response.json({ user, devices: devicesForUser(user.id).length });
});

usersRouter.patch('/users/:id', optionalAuth, ensureSelf, (request, response) => {
  const body = z
    .object({ displayName: z.string().max(80).optional(), profile: profileSchema.optional() })
    .parse(request.body ?? {});

  const user = updateUser(request.params.id, body);
  if (!user) return response.status(404).json({ error: 'User not found' });
  return response.json({ user });
});

// --- push tokens ------------------------------------------------------------

usersRouter.post('/users/:id/devices', optionalAuth, ensureSelf, (request, response) => {
  const body = z
    .object({ token: z.string().min(10).max(300), platform: z.string().max(20).optional() })
    .parse(request.body);

  const user = getUser(request.params.id);
  if (!user) return response.status(404).json({ error: 'User not found' });

  saveDevice({ token: body.token, userId: user.id, platform: body.platform });
  return response.status(201).json({ registered: true, devices: devicesForUser(user.id).length });
});

usersRouter.delete('/users/:id/devices/:token', optionalAuth, ensureSelf, (request, response) => {
  response.json({ removed: removeDevice(request.params.token) });
});

// --- saved items ------------------------------------------------------------

const entitySchema = z.object({ entity: z.enum(['item', 'job']), entityId: z.string().min(1) });

usersRouter.get('/users/:id/saved', optionalAuth, ensureSelf, (request, response) => {
  const user = getUser(request.params.id);
  if (!user) return response.status(404).json({ error: 'User not found' });

  return response.json({
    items: savedIds(user.id, 'item').map(getItem).filter(Boolean),
    jobs: savedIds(user.id, 'job').map(getJob).filter(Boolean),
  });
});

usersRouter.post('/users/:id/saved', optionalAuth, ensureSelf, (request, response) => {
  const body = entitySchema.parse(request.body);
  const user = getUser(request.params.id);
  if (!user) return response.status(404).json({ error: 'User not found' });

  saveEntity(user.id, body.entity, body.entityId);
  return response.status(201).json({ saved: true });
});

usersRouter.delete('/users/:id/saved/:entity/:entityId', optionalAuth, ensureSelf, (request, response) => {
  const { entity, entityId } = entitySchema.parse(request.params);
  response.json({ removed: unsaveEntity(request.params.id, entity, entityId) });
});
