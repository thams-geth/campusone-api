import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  tenantId: string
  userId: string
  // A role *name* (e.g. "SUPER_ADMIN"), not the old Prisma enum — roles
  // are now DB rows (see the Role model) so custom/tenant-specific
  // roles can exist without a schema change. Permission checks resolve
  // this name through requirePermission (src/middleware/requireAuth.ts).
  role: string
  // Set by requireAuth from req.requestId (see middleware/requestId.ts).
  // Absent in the pre-auth bootstrap contexts (login/refresh/logout)
  // since there's no request object at that layer to read it from.
  requestId?: string
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
