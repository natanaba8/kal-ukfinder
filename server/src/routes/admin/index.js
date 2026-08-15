import { Router } from 'express';

import { requireAuth, requireRole } from '../../auth/guard.js';
import { adminContentRouter } from './content.js';
import { adminSourcesRouter } from './sources.js';
import { adminStatsRouter } from './stats.js';
import { adminUsersRouter } from './users.js';

export const adminRouter = Router();

/**
 * Every admin endpoint is behind authentication and a role check, applied here
 * once rather than per-route so a new route cannot be added unprotected by
 * accident (pr.md §4, §42.12).
 */
adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.use(adminStatsRouter);
adminRouter.use(adminSourcesRouter);
adminRouter.use(adminContentRouter);
adminRouter.use(adminUsersRouter);
