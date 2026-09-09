import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { env } from '../src/config/env'
import { prisma } from '../src/prisma/client'
import { requestContext } from '../src/prisma/tenantContext'
import { hashPassword } from '../src/modules/auth/auth.service'
import { seedGlobalRbac, seedTenantRoles } from '../src/modules/rbac/rbac.seed'

// Dev convenience only — not run in CI or production. Bypasses the
// tenant-scoped extended client for tenant/user lookups that must run
// before a tenant context exists, same as src/test/helpers.ts.
const rawPrisma = new PrismaClient({ adapter: new PrismaPg(env.APP_DATABASE_URL) })

const DEMO_SLUG = 'demo-college'
const DEMO_ADMIN_EMAIL = 'admin@demo-college.test'
const DEMO_ADMIN_PASSWORD = 'Passw0rd!'

async function main() {
  let tenant = await rawPrisma.tenant.findUnique({ where: { slug: DEMO_SLUG } })
  if (!tenant) {
    tenant = await rawPrisma.tenant.create({ data: { name: 'Demo College', slug: DEMO_SLUG } })
  }
  const tenantId = tenant.id

  // seedGlobalRbac touches only tenant-independent data (the Permission
  // catalogue, the one cross-tenant PLATFORM_ADMIN role), but still
  // runs through the tenant-scoped Prisma extension, which requires
  // SOME request context to be set — the demo tenant's is as good as
  // any (see src/prisma/client.ts).
  await requestContext.run({ tenantId, userId: 'seed', role: 'SUPER_ADMIN' }, seedGlobalRbac)
  await seedTenantRoles(tenantId)

  // A plain rawPrisma query can't see this row: User has RLS, and
  // rawPrisma never sets app.current_tenant/app.tenant_bootstrap, so
  // the policy filters everything out regardless of the connecting
  // role. Check existence through the tenant-scoped client instead.
  const seeded = await requestContext.run({ tenantId, userId: 'seed', role: 'SUPER_ADMIN' }, async () => {
    const existingAdmin = await prisma.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL } })
    if (existingAdmin) return false

    const passwordHash = await hashPassword(DEMO_ADMIN_PASSWORD)
    const user = await prisma.user.create({
      data: { tenantId, name: 'Demo Admin', email: DEMO_ADMIN_EMAIL, passwordHash, isActive: true },
    })
    const role = await prisma.role.findFirstOrThrow({ where: { tenantId, name: 'SUPER_ADMIN' } })
    await prisma.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } })
    return true
  })

  console.log(
    seeded
      ? `Seeded demo tenant "${DEMO_SLUG}" with admin ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD}`
      : `Demo tenant "${DEMO_SLUG}" already seeded.`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await rawPrisma.$disconnect()
  })
