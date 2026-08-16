/**
 * The Kal-UKFinder API as a Vercel serverless function.
 *
 * Vercel does not run a long-lived Node process, so this file deliberately does
 * NOT start the schedulers that `server/src/index.js` starts when it is the
 * entry point. Collection is driven by Vercel Cron instead — see
 * `api/cron/[job].js` and the `crons` block in `vercel.json`.
 *
 * The Express app is built once per warm instance and reused across invocations.
 */
import { bootstrapAdmin } from '../server/src/auth/bootstrap.js';
import { createApp } from '../server/src/index.js';
import { createLogger } from '../server/src/logger.js';

const log = createLogger('api');

const app = createApp();

// `server/src/index.js` only bootstraps the first admin when it is the process
// entry point, which never happens here. Do it once per cold start instead —
// it is idempotent, so the second instance to run it does nothing.
let bootstrapped = null;
const ensureBootstrapped = () => {
  bootstrapped ??= bootstrapAdmin().catch((error) => {
    log.error(`admin bootstrap failed: ${error.message}`);
  });
  return bootstrapped;
};

export default async function handler(request, response) {
  await ensureBootstrapped();
  return app(request, response);
}
