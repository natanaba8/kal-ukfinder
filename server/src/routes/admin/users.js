import { Router } from 'express';
import { z } from 'zod';

import { ROLES, hasRole } from '../../auth/guard.js';
import { revokeAllForUser } from '../../auth/sessions.js';
import { deleteUser, getUser, listUsersPaged, setRole, setStatus } from '../../store/users.js';

export const adminUsersRouter = Router();

adminUsersRouter.get('/users', async (request, response) => {
  const query = z
    .object({
      search: z.string().optional(),
      role: z.enum(ROLES).optional(),
      status: z.enum(['ACTIVE', 'DISABLED']).optional(),
      includeAnonymous: z.enum(['true', 'false']).default('false'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    })
    .parse(request.query);

  response.json(await listUsersPaged({ ...query, includeAnonymous: query.includeAnonymous === 'true' }));
});

adminUsersRouter.get('/users/:id', async (request, response) => {
  const user = await getUser(request.params.id);
  if (!user) return response.status(404).json({ error: 'User not found' });
  return response.json({ user });
});

/**
 * Role changes are restricted so an ADMIN cannot mint a SUPER_ADMIN or edit one.
 * Only a SUPER_ADMIN can grant the top role.
 */
adminUsersRouter.patch('/users/:id/role', async (request, response) => {
  const { role } = z.object({ role: z.enum(ROLES) }).parse(request.body);
  const target = await getUser(request.params.id);
  if (!target) return response.status(404).json({ error: 'User not found' });

  const actorRole = request.auth.role;
  if (request.auth.userId === target.id) {
    return response.status(400).json({ error: 'You cannot change your own role', code: 'SELF_ROLE_CHANGE' });
  }
  if (!hasRole(actorRole, 'SUPER_ADMIN') && (role === 'SUPER_ADMIN' || target.role === 'SUPER_ADMIN')) {
    return response.status(403).json({ error: 'Only a super admin can manage super admins', code: 'FORBIDDEN' });
  }

  await setRole(target.id, role);
  // Anything they had open should reflect the new permissions immediately.
  await revokeAllForUser(target.id);

  return response.json({ user: await getUser(target.id) });
});

adminUsersRouter.patch('/users/:id/status', async (request, response) => {
  const { status } = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) }).parse(request.body);
  const target = await getUser(request.params.id);
  if (!target) return response.status(404).json({ error: 'User not found' });

  if (request.auth.userId === target.id) {
    return response.status(400).json({ error: 'You cannot disable your own account', code: 'SELF_DISABLE' });
  }
  if (target.role === 'SUPER_ADMIN' && !hasRole(request.auth.role, 'SUPER_ADMIN')) {
    return response.status(403).json({ error: 'Only a super admin can disable a super admin', code: 'FORBIDDEN' });
  }

  await setStatus(target.id, status);
  if (status === 'DISABLED') await revokeAllForUser(target.id);

  return response.json({ user: await getUser(target.id) });
});

adminUsersRouter.delete('/users/:id', async (request, response) => {
  const target = await getUser(request.params.id);
  if (!target) return response.status(404).json({ error: 'User not found' });

  if (request.auth.userId === target.id) {
    return response.status(400).json({ error: 'You cannot delete your own account', code: 'SELF_DELETE' });
  }
  if (target.role === 'SUPER_ADMIN' && !hasRole(request.auth.role, 'SUPER_ADMIN')) {
    return response.status(403).json({ error: 'Only a super admin can delete a super admin', code: 'FORBIDDEN' });
  }

  await deleteUser(target.id);
  return response.json({ deleted: true });
});
