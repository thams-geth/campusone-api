import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as rbacController from './rbac.controller'

// Mounted at the /api/v1 root (see app.ts) — its own admin surface
// rather than one resource prefix: /roles, /permissions, /users/:id/role.
export const rbacRouter = Router()

rbacRouter.use(requireAuth, requireModule('CORE'))

rbacRouter.get('/roles', requirePermission('ROLE_READ'), rbacController.listRoles)
rbacRouter.get('/permissions', requirePermission('ROLE_READ'), rbacController.listPermissions)
rbacRouter.post('/users/:id/role', requirePermission('ROLE_MANAGE'), rbacController.assignRole)
