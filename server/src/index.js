import path from 'node:path';

import express from 'express';
import cron from 'node-cron';
import { ZodError } from 'zod';

import { isAiEnabled } from './ai/gemini.js';
import { bootstrapAdmin } from './auth/bootstrap.js';
import { config } from './config.js';
import { countItems } from './store/items.js';
import { runIngest } from './ingest.js';
import { createLogger } from './logger.js';
import { apiLimiter } from './middleware/rate-limit.js';
import { corsPolicy, csrfGuard, securityHeaders } from './middleware/security.js';
import { runDigest } from './notifications/digest.js';
import { startScheduler } from './scheduler/index.js';
import { adminRouter } from './routes/admin/index.js';
import { aiRouter } from './routes/ai.js';
import { authRouter } from './routes/auth.js';
import { feedRouter } from './routes/feed.js';
import { jobsRouter } from './routes/jobs.js';
import { metaRouter } from './routes/meta.js';
import { notificationsRouter } from './routes/notifications.js';
import { usersRouter } from './routes/users.js';
import { jobProvidersConfigured } from './sources/jobs.js';

const log = createLogger('server');

export const createApp = () => {
  const app = express();

  // Trust the first proxy hop so rate limiting and audit logs see the real IP.
  app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(corsPolicy());
  app.use(express.json({ limit: '4mb' }));
  app.use(csrfGuard);
  app.use('/api', apiLimiter);

  app.use('/api', authRouter);
  app.use('/api', metaRouter);
  app.use('/api', feedRouter);
  app.use('/api', jobsRouter);
  app.use('/api', aiRouter);
  app.use('/api', usersRouter);
  app.use('/api', notificationsRouter);
  app.use('/api/admin', adminRouter);

  app.get('/', (request, response) => {
    response.json({
      name: 'Kal-UKFinder API',
      docs: '/api/status',
      endpoints: [
        '/api/auth/login',
        '/api/feed',
        '/api/news',
        '/api/policies',
        '/api/jobs',
        '/api/search',
        '/api/ai/ask',
        '/api/taxonomy',
        '/api/admin/stats',
      ],
    });
  });

  app.use((request, response) => response.status(404).json({ error: `No route for ${request.method} ${request.path}` }));

  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
  app.use((error, request, response, next) => {
    if (error instanceof ZodError) {
      return response.status(400).json({
        error: 'Invalid request',
        details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    log.error(error.stack ?? error.message);
    return response.status(500).json({ error: 'Something went wrong on the server' });
  });

  return app;
};

const startSchedulers = () => {
  // Collection is per-source now — see scheduler/index.js.
  startScheduler();

  if (config.digest.enabled) {
    cron.schedule(config.digest.cron, () => {
      runDigest().catch((error) => log.error(`scheduled digest failed: ${error.message}`));
    });
    log.info(`digest scheduled (${config.digest.cron})`);
  }
};

/** Only boot the listener when this file is the entry point (tests import createApp). */
const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === import.meta.filename;

if (isMain) {
  const app = createApp();

  app.listen(config.port, async () => {
    log.info(`listening on http://localhost:${config.port}`);
    log.info(`AI: ${isAiEnabled() ? `${config.ai.fastModel} / ${config.ai.smartModel}` : 'rule-based fallback (no GEMINI_API_KEY)'}`);
    log.info(`job providers: ${jobProvidersConfigured().join(', ')}`);

    await bootstrapAdmin().catch((error) => log.error(`admin bootstrap failed: ${error.message}`));

    startSchedulers();

    // A fresh database is empty and the app would look broken — fill it now.
    if (countItems() === 0) {
      log.info('empty database, running first ingest...');
      runIngest().catch((error) => log.error(`first ingest failed: ${error.message}`));
    }
  });
}
