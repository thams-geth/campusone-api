import { AsyncLocalStorage } from 'node:async_hooks'
import type { Role } from '@prisma/client'

export interface RequestContext {
  tenantId: string
  userId: string
  role: Role
}

/**
 * Carries the authenticated tenant/user/role through the request
 * lifecycle without threading it as a parameter through every function
 * — see CLAUDE.md's multi-tenancy section for why that matters (a
 * forgotten parameter is how cross-tenant leaks happen).
 *
 * Set once in middleware right after JWT verification (see
 * middleware/tenantContext.ts); read by the Prisma client extension in
 * ./client.ts on every query.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>()

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore()
}

export function getRequestContextOrThrow(): RequestContext {
  const ctx = requestContext.getStore()
  if (!ctx) {
    throw new Error('No tenant context set — this code path must run inside requestContext.run(...)')
  }
  return ctx
}
