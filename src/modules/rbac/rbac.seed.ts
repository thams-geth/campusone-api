import { prisma } from '../../prisma/client'
import { requestContext } from '../../prisma/tenantContext'
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES, type PermissionKey } from './permissions'

async function ensurePermissionCatalogue(): Promise<void> {
  await prisma.permission.createMany({
    data: Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description })),
    skipDuplicates: true,
  })
}

async function grantPermissions(roleId: string, tenantId: string | null, keys: PermissionKey[]): Promise<void> {
  if (keys.length === 0) return
  const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } })
  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({ roleId, tenantId, permissionId: permission.id })),
    skipDuplicates: true,
  })
}

/**
 * Seeds the global permission catalogue and the single cross-tenant
 * PLATFORM_ADMIN role. Idempotent — safe to call on every app boot or
 * from prisma/seed.ts. PLATFORM_ADMIN isn't looked up via the usual
 * `[tenantId, name]` unique index (tenantId is NULL, and Postgres
 * treats NULL <> NULL in unique indexes, so upsert can't dedupe it) —
 * hence the explicit findFirst guard below.
 */
export async function seedGlobalRbac(): Promise<void> {
  await ensurePermissionCatalogue()

  let platformAdmin = await prisma.role.findFirst({ where: { tenantId: null, name: 'PLATFORM_ADMIN' } })
  if (!platformAdmin) {
    platformAdmin = await prisma.role.create({ data: { tenantId: null, name: 'PLATFORM_ADMIN', isSystem: true } })
  }
  await grantPermissions(platformAdmin.id, null, DEFAULT_ROLE_PERMISSIONS.PLATFORM_ADMIN)
}

/**
 * Seeds the 9 tenant-scoped system roles (everything except
 * PLATFORM_ADMIN) and their default permission grants for one tenant.
 * Call this once, right after creating a tenant — every test tenant and
 * every real tenant needs its own role rows before any user can log in
 * (see auth.service.ts's role resolution).
 */
export async function seedTenantRoles(tenantId: string): Promise<void> {
  await requestContext.run({ tenantId, userId: 'system', role: 'SUPER_ADMIN' }, async () => {
    await ensurePermissionCatalogue()

    for (const name of SYSTEM_ROLES) {
      if (name === 'PLATFORM_ADMIN') continue
      const role = await prisma.role.upsert({
        where: { tenantId_name: { tenantId, name } },
        update: {},
        create: { tenantId, name, isSystem: true },
      })
      await grantPermissions(role.id, tenantId, DEFAULT_ROLE_PERMISSIONS[name])
    }
  })
}
