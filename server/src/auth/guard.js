import { resolveSession } from './sessions.js';
import { getUser } from '../store/users.js';

/**
 * Authorization is enforced here, on the server, for every protected route.
 * pr.md §4 and §42.12 are explicit that client-side route guards are not
 * enough — the admin panel hiding a link proves nothing.
 */

export const ROLES = ['USER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN'];

/** Higher rank satisfies any requirement at or below it. */
const RANK = { USER: 0, EDITOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

export const hasRole = (role, required) => (RANK[role] ?? -1) >= (RANK[required] ?? 99);

const bearerToken = (request) => {
  const header = request.get('authorization') ?? '';
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && value) return value.trim();

  // The admin panel may send the session in a cookie instead.
  const cookie = request.get('cookie') ?? '';
  const match = /(?:^|;\s*)kal_session=([^;]+)/.exec(cookie);
  return match ? decodeURIComponent(match[1]) : null;
};

/**
 * Populates `request.auth` when a valid session is present, and never rejects.
 * Used on browse routes so signed-out visitors still get content (the product
 * decision recorded in docs/integration-plan.md §H).
 */
export const optionalAuth = async (request, response, next) => {
  const token = bearerToken(request);
  if (!token) return next();

  const session = await resolveSession(token);
  if (!session || session.disabled) return next();

  request.auth = session;
  return next();
};

export const requireAuth = async (request, response, next) => {
  const token = bearerToken(request);
  if (!token) {
    return response.status(401).json({ error: 'Sign in to continue', code: 'UNAUTHENTICATED' });
  }

  const session = await resolveSession(token);
  if (!session) {
    return response.status(401).json({ error: 'Your session has expired. Sign in again.', code: 'SESSION_EXPIRED' });
  }
  if (session.disabled) {
    return response.status(403).json({ error: 'This account has been disabled', code: 'ACCOUNT_DISABLED' });
  }

  request.auth = session;
  return next();
};

export const requireRole =
  (required = 'ADMIN') =>
  (request, response, next) => {
    if (!request.auth) {
      return response.status(401).json({ error: 'Sign in to continue', code: 'UNAUTHENTICATED' });
    }
    if (!hasRole(request.auth.role, required)) {
      return response.status(403).json({ error: 'You do not have access to this area', code: 'FORBIDDEN' });
    }
    return next();
  };

/** Convenience for admin routers: authenticate, then check the role. */
export const adminOnly = [requireAuth, requireRole('ADMIN')];
export const editorOnly = [requireAuth, requireRole('EDITOR')];

/**
 * Resolve the acting user, accepting a legacy `userId` parameter when the
 * request is unauthenticated. This keeps existing anonymous installs working
 * through the transition (§42.2 — do not delete existing functionality) while
 * authenticated clients always win.
 */
export const actingUser = async (request) => {
  if (request.auth) return await getUser(request.auth.userId);

  const legacyId = request.params?.userId ?? request.body?.userId ?? request.query?.userId;
  return legacyId ? await getUser(String(legacyId)) : null;
};
