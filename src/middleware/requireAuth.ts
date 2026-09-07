import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { Role } from '@prisma/client'
import { env } from '../config/env'
import { ApiError } from '../utils/ApiError'
import { requestContext } from '../prisma/tenantContext'
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
  requestContext.run({ tenantId: payload.tenantId, userId: payload.sub, role: payload.role }, next)
}

/** RBAC guard: explicit per-route allow-list, never an inferred hierarchy. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(ApiError.unauthorized())
      return
    }
    if (!roles.includes(req.auth.role)) {
      next(ApiError.forbidden())
      return
    }
    next()
  }
}
