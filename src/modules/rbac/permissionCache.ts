import { prisma } from '../../prisma/client'

// Short TTL rather than embedding permissions in the JWT: an admin
// revoking a grant should take effect within seconds, not only once
// every access token expires. A DB hit per uncached lookup is an
// acceptable cost for how rarely roles change relative to requests.
const TTL_MS = 60_000

interface CacheEntry {
  permissions: Set<string>
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function cacheKey(tenantId: string, roleName: string): string {
  return `${tenantId}:${roleName}`
}

async function loadPermissions(tenantId: string, roleName: string): Promise<Set<string>> {
  // A role row is either owned by this tenant, or is the one global,
  // cross-tenant PLATFORM_ADMIN role (tenantId null) — see the Role
  // model's doc comment in schema.prisma.
  const role = await prisma.role.findFirst({
    where: { name: roleName, OR: [{ tenantId }, { tenantId: null }] },
    include: { permissions: { include: { permission: true } } },
  })
  return new Set(role?.permissions.map((grant) => grant.permission.key) ?? [])
}

/** Resolves the permission keys granted to a role name within a tenant, cached briefly. */
export async function getPermissionsForRole(tenantId: string, roleName: string): Promise<Set<string>> {
  const key = cacheKey(tenantId, roleName)
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions
  }

  const permissions = await loadPermissions(tenantId, roleName)
  cache.set(key, { permissions, expiresAt: Date.now() + TTL_MS })
  return permissions
}

/** Exposed for tests and for future role-management endpoints that edit grants. */
export function clearPermissionCache(): void {
  cache.clear()
}
