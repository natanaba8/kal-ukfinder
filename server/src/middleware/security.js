import cors from 'cors';
import helmet from 'helmet';

import { config } from '../config.js';

/**
 * Security headers and CORS (pr.md §28).
 *
 * The API serves JSON to a native app and a separate admin origin, so the
 * browser-facing protections that matter are the transport headers and a CORS
 * allow-list — not a CSP for pages we never render.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'no-referrer' },
});

export const corsPolicy = () => {
  if (config.corsOrigin === '*') {
    // Development default. Credentials stay off so a wildcard origin is safe.
    return cors({ origin: true, credentials: false });
  }

  const allowed = config.corsOrigin.split(',').map((entry) => entry.trim()).filter(Boolean);

  return cors({
    origin(origin, callback) {
      // Same-origin and non-browser clients (the mobile app) send no Origin.
      if (!origin || allowed.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed`));
    },
    credentials: true,
  });
};

/**
 * Requests carrying a session cookie must also carry an explicit header, so a
 * cross-site form post cannot act on a signed-in admin (pr.md §28 CSRF).
 * Bearer-token clients are unaffected — a cross-site page cannot read the token.
 */
export const csrfGuard = (request, response, next) => {
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  const usesCookie = /(?:^|;\s*)kal_session=/.test(request.get('cookie') ?? '');
  const hasBearer = (request.get('authorization') ?? '').toLowerCase().startsWith('bearer ');

  if (isMutation && usesCookie && !hasBearer && request.get('x-requested-with') !== 'kal-admin') {
    return response.status(403).json({ error: 'Missing request verification header', code: 'CSRF' });
  }

  return next();
};
