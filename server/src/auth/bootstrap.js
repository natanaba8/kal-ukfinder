import { db } from '../db.js';
import { config } from '../config.js';
import { createLogger } from '../logger.js';
import { hashPassword, passwordProblems } from './passwords.js';
import { attachCredentials, createUser, getUserByEmail, setRole } from '../store/users.js';

const log = createLogger('bootstrap');

/**
 * Creates the first administrator so the admin panel is reachable on a fresh
 * install. Runs only when no ADMIN exists — it will never overwrite or re-grant
 * an account, so leaving the variables set in production is harmless.
 */
export const bootstrapAdmin = async () => {
  const existing = db
    .prepare("SELECT COUNT(*) AS total FROM users WHERE role IN ('ADMIN','SUPER_ADMIN')")
    .get().total;

  if (existing > 0) return { created: false, reason: 'an administrator already exists' };

  const { bootstrapAdminEmail: email, bootstrapAdminPassword: password } = config.auth;
  if (!email || !password) {
    log.warn(
      'no administrator account yet — set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env, then restart',
    );
    return { created: false, reason: 'ADMIN_EMAIL / ADMIN_PASSWORD not set' };
  }

  const problems = passwordProblems(password);
  if (problems.length > 0) {
    log.error(`ADMIN_PASSWORD rejected: ${problems.join('; ')}`);
    return { created: false, reason: problems[0] };
  }

  const already = getUserByEmail(email);
  const user = already ?? createUser({ displayName: 'Administrator' });

  if (!already) {
    attachCredentials(user.id, {
      email,
      passwordHash: await hashPassword(password),
      displayName: 'Administrator',
    });
  }

  setRole(user.id, 'SUPER_ADMIN');
  log.info(`administrator ready: ${email}`);
  return { created: true, email };
};
