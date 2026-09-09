import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { ApiError } from '../utils/ApiError'
import { requestContext } from '../prisma/tenantContext'
import { getPermissionsForRole } from '../modules/rbac/permissionCache'
import type { PermissionKey } from '../modules/rbac/permissions'
import type { AccessTokenPayload } from '../modules/auth/token.types'

/**
 * Verifies the access token and establishes the tenant/user/role
 * context for the rest of the request (every Prisma query downstream
 * reads it — see src/prisma/client.ts). Both steps live in one
 * middleware because there's no valid state where one exists without
 * the other: an authenticated request always has an active tenant.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    next(ApiError.unauthorized())
    return
  }

  let payload: AccessTokenPayload
  try {
    payload = jwt.verify(header.slice('Bearer '.length), env.JWT_ACCESS_SECRET) as AccessTokenPayload
  } catch {
    next(ApiError.unauthorized('Invalid or expired session. Please sign in again.'))
    return
  }

  req.auth = { userId: payload.sub, tenantId: payload.tenantId, role: payload.role }
  requestContext.run(
    { tenantId: payload.tenantId, userId: payload.sub, role: payload.role, requestId: req.requestId },
    next,
  )
}

/**
 * RBAC guard: resolves the caller's role to its granted permission set
 * (Role/Permission/RolePermission — see src/modules/rbac) and allows
 * the request through if it holds ANY of the listed permissions. Routes
 * declare what they need in terms of permissions, never role names —
 * that's what makes roles/grants editable as data instead of code.
 */
export function requirePermission(...keys: PermissionKey[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(ApiError.unauthorized())
      return
    }
    const granted = await getPermissionsForRole(req.auth.tenantId, req.auth.role)
    if (!keys.some((key) => granted.has(key))) {
      next(ApiError.forbidden())
      return
    }
    next()
  }
}
