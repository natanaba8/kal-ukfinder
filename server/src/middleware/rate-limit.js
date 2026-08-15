import rateLimit from 'express-rate-limit';

/**
 * Rate limits (pr.md §28).
 *
 * Credential endpoints are the ones worth defending — everything else gets a
 * generous ceiling that only catches runaway clients. Tests disable them so a
 * fast suite does not trip the limiter.
 */
const disabled = process.env.NODE_ENV === 'test' || process.env.RATE_LIMIT_ENABLED === 'false';

const passthrough = (request, response, next) => next();

const build = (options) =>
  disabled
    ? passthrough
    : rateLimit({
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: 'Too many requests. Wait a minute and try again.', code: 'RATE_LIMITED' },
        ...options,
      });

/** Login, register, password reset — 10 attempts per 15 minutes per IP. */
export const authLimiter = build({
  windowMs: 15 * 60_000,
  limit: 10,
  message: {
    error: 'Too many attempts. Wait 15 minutes before trying again.',
    code: 'RATE_LIMITED',
  },
});

/** General API ceiling. */
export const apiLimiter = build({ windowMs: 60_000, limit: 240 });

/** AI endpoints cost real money per call, so they are tighter. */
export const aiLimiter = build({
  windowMs: 60_000,
  limit: 20,
  message: { error: 'You are asking faster than the coach can think. Try again shortly.', code: 'RATE_LIMITED' },
});

/** Source testing hits third-party sites — keep an admin from hammering them. */
export const scrapeLimiter = build({
  windowMs: 60_000,
  limit: 20,
  message: { error: 'Too many source tests in a row. Give the target site a moment.', code: 'RATE_LIMITED' },
});
