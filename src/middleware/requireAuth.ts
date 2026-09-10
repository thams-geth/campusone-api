import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { ApiError } from '../utils/ApiError'
import { requestContext } from '../prisma/tenantContext'
import { findApiKeyByHash, prisma } from '../prisma/client'
import { getPermissionsForRole } from '../modules/rbac/permissionCache'
import { getPrimaryRoleName } from '../modules/auth/auth.service'
import { hashApiKey } from '../modules/api-keys/apiKey.service'
import type { PermissionKey } from '../modules/rbac/permissions'
import type { AccessTokenPayload } from '../modules/auth/token.types'

/**
 * Resolves an X-API-Key header to the tenant/user/role of the user who
 * created it — a key authenticates AS its creating user rather than
 * carrying its own separate scope, so it reuses every existing
 * requirePermission check instead of a parallel authorization system.
 */
async function authenticateWithApiKey(req: Request, _res: Response, next: NextFunction, rawKey: string) {
  const record = await findApiKeyByHash(hashApiKey(rawKey))
  if (!record || record.revokedAt || !record.createdBy.isActive) {
    next(ApiError.unauthorized('Invalid or revoked API key.'))
    return
  }

  req.auth = { userId: record.createdByUserId, tenantId: record.tenantId, role: 'UNRESOLVED' }
  requestContext.run(
    { tenantId: record.tenantId, userId: record.createdByUserId, role: 'UNRESOLVED', requestId: req.requestId },
    async () => {
      const role = await getPrimaryRoleName(record.createdByUserId)
      req.auth = { userId: record.createdByUserId, tenantId: record.tenantId, role }
      await prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      requestContext.run(
        { tenantId: record.tenantId, userId: record.createdByUserId, role, requestId: req.requestId },
        next,
      )
    },
  ).catch(next)
}

/**
 * Verifies the access token and establishes the tenant/user/role
 * context for the rest of the request (every Prisma query downstream
 * reads it — see src/prisma/client.ts). Both steps live in one
 * middleware because there's no valid state where one exists without
 * the other: an authenticated request always has an active tenant.
 *
 * Also accepts an `X-API-Key` header as an alternate credential when
 * there's no Authorization: Bearer token — see authenticateWithApiKey.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    const apiKeyHeader = req.headers['x-api-key']
    const rawKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader
    if (rawKey) {
      void authenticateWithApiKey(req, res, next, rawKey)
      return
    }
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
