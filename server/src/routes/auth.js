import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../auth/guard.js';
import { hashPassword, passwordProblems, verifyPassword } from '../auth/passwords.js';
import {
  activeSessionCount,
  consumePasswordReset,
  createPasswordReset,
  createSession,
  revokeAllForUser,
  revokeSession,
  rotateSession,
} from '../auth/sessions.js';
import { config } from '../config.js';
import { createLogger } from '../logger.js';
import { authLimiter } from '../middleware/rate-limit.js';
import {
  attachCredentials,
  createUser,
  getUser,
  getUserByEmail,
  getPasswordHash,
  normaliseEmail,
  recordLogin,
  setPasswordHash,
} from '../store/users.js';

const log = createLogger('auth');

export const authRouter = Router();

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  status: user.status,
  anonymous: user.anonymous,
  profile: user.profile,
  createdAt: user.createdAt,
});

const context = (request) => ({ userAgent: request.get('user-agent'), ip: request.ip });

const credentials = z.object({
  email: z.string().email('Enter a valid email address').max(200),
  password: z.string().min(1, 'Enter your password').max(200),
});

// --- register ---------------------------------------------------------------

const registerSchema = credentials.extend({
  displayName: z.string().max(80).optional(),
  /** Upgrades this anonymous account instead of creating a new one. */
  anonymousUserId: z.string().uuid().optional(),
});

authRouter.post('/auth/register', authLimiter, async (request, response) => {
  if (!config.auth.allowRegistration) {
    return response.status(403).json({ error: 'Registration is currently closed' });
  }

  const body = registerSchema.parse(request.body);
  const problems = passwordProblems(body.password);
  if (problems.length > 0) {
    return response.status(400).json({ error: problems[0], code: 'WEAK_PASSWORD', details: problems });
  }

  if (await getUserByEmail(body.email)) {
    return response.status(409).json({ error: 'An account with that email already exists', code: 'EMAIL_TAKEN' });
  }

  const passwordHash = await hashPassword(body.password);

  // Claim the anonymous record so saved items and coach history carry over.
  const existing = body.anonymousUserId ? await getUser(body.anonymousUserId) : null;
  const target = existing && existing.anonymous ? existing : await createUser({ displayName: body.displayName ?? '' });
  const user = await attachCredentials(target.id, {
    email: body.email,
    passwordHash,
    displayName: body.displayName ?? '',
  });

  await recordLogin(user.id);
  const session = await createSession({ userId: user.id, ...context(request) });

  log.info(`registered ${normaliseEmail(body.email)}${existing?.anonymous ? ' (claimed anonymous account)' : ''}`);
  return response.status(201).json({ user: publicUser(user), token: session.token, expiresAt: session.expiresAt });
});

// --- login ------------------------------------------------------------------

authRouter.post('/auth/login', authLimiter, async (request, response) => {
  const body = credentials.parse(request.body);
  const user = await getUserByEmail(body.email);

  // Same response and similar timing whether or not the email exists.
  const storedHash = user ? await getPasswordHash(user.id) : null;
  const ok = await verifyPassword(body.password, storedHash ?? 'scrypt$32768$8$1$AAAA$AAAA');

  if (!user || !storedHash || !ok) {
    return response.status(401).json({ error: 'Email or password is incorrect', code: 'INVALID_CREDENTIALS' });
  }
  if (user.status === 'DISABLED') {
    return response.status(403).json({ error: 'This account has been disabled', code: 'ACCOUNT_DISABLED' });
  }

  await recordLogin(user.id);
  const session = await createSession({ userId: user.id, ...context(request) });

  return response.json({ user: publicUser(user), token: session.token, expiresAt: session.expiresAt });
});

// --- session lifecycle ------------------------------------------------------

authRouter.post('/auth/refresh', async (request, response) => {
  const token = z.object({ token: z.string().min(10) }).parse(request.body).token;
  const rotated = await rotateSession(token, context(request));

  if (!rotated) {
    return response.status(401).json({ error: 'Your session has expired. Sign in again.', code: 'SESSION_EXPIRED' });
  }

  const user = await getUser(rotated.userId);
  return response.json({ user: publicUser(user), token: rotated.token, expiresAt: rotated.expiresAt });
});

authRouter.post('/auth/logout', requireAuth, async (request, response) => {
  const header = request.get('authorization') ?? '';
  await revokeSession(header.split(' ')[1] ?? '');
  response.json({ loggedOut: true });
});

authRouter.get('/auth/me', requireAuth, async (request, response) => {
  const user = await getUser(request.auth.userId);
  if (!user) return response.status(404).json({ error: 'Account not found' });
  return response.json({ user: publicUser(user), sessions: await activeSessionCount(user.id) });
});

// --- password management ----------------------------------------------------

authRouter.post('/auth/change-password', requireAuth, async (request, response) => {
  const body = z
    .object({ currentPassword: z.string().max(200), newPassword: z.string().max(200) })
    .parse(request.body);

  const storedHash = await getPasswordHash(request.auth.userId);
  if (!storedHash || !(await verifyPassword(body.currentPassword, storedHash))) {
    return response.status(401).json({ error: 'Your current password is incorrect', code: 'INVALID_CREDENTIALS' });
  }

  const problems = passwordProblems(body.newPassword);
  if (problems.length > 0) {
    return response.status(400).json({ error: problems[0], code: 'WEAK_PASSWORD', details: problems });
  }

  await setPasswordHash(request.auth.userId, await hashPassword(body.newPassword));
  await revokeAllForUser(request.auth.userId);

  // Give them a working session back so they are not kicked out of the app.
  const session = await createSession({ userId: request.auth.userId, ...context(request) });
  return response.json({ changed: true, token: session.token, expiresAt: session.expiresAt });
});

authRouter.post('/auth/forgot-password', authLimiter, async (request, response) => {
  const { email } = z.object({ email: z.string().email().max(200) }).parse(request.body);
  const user = await getUserByEmail(email);

  // Always the same answer — never confirm whether an address is registered.
  const payload = { sent: true, message: 'If that email has an account, a reset link is on its way.' };

  if (!user) return response.json(payload);

  const token = await createPasswordReset(user.id);
  const link = `${config.auth.adminUrl}/reset-password?token=${token}`;

  // No mail transport is configured in this project. The token is logged so the
  // flow is testable, and returned in development only.
  log.info(`password reset for ${normaliseEmail(email)}: ${link}`);

  return response.json(
    process.env.NODE_ENV === 'production' ? payload : { ...payload, devToken: token, devLink: link },
  );
});

authRouter.post('/auth/reset-password', authLimiter, async (request, response) => {
  const body = z.object({ token: z.string().min(10), password: z.string().max(200) }).parse(request.body);

  const problems = passwordProblems(body.password);
  if (problems.length > 0) {
    return response.status(400).json({ error: problems[0], code: 'WEAK_PASSWORD', details: problems });
  }

  const userId = await consumePasswordReset(body.token);
  if (!userId) {
    return response.status(400).json({ error: 'That reset link is invalid or has expired', code: 'INVALID_TOKEN' });
  }

  await setPasswordHash(userId, await hashPassword(body.password));
  await revokeAllForUser(userId);

  const session = await createSession({ userId, ...context(request) });
  return response.json({ reset: true, user: publicUser(await getUser(userId)), token: session.token });
});

export { publicUser };
