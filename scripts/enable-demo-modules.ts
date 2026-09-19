import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type ModuleId } from '@prisma/client'
import { env } from '../src/config/env'
import { prisma } from '../src/prisma/client'
import { requestContext } from '../src/prisma/tenantContext'

// Bypasses the tenant-scoped extended client for the tenant lookup,
// which must run before a tenant context exists — same pattern as
// prisma/seed.ts's rawPrisma.
const rawPrisma = new PrismaClient({ adapter: new PrismaPg(env.APP_DATABASE_URL) })

const DEMO_SLUG = 'demo-college'
const MODULES: ModuleId[] = [
  'ACADEMICS',
  'EXAMINATION',
  'COMMUNICATION',
  'ADMISSIONS',
  'FINANCE',
  'HOSTEL_TRANSPORT',
  'LIBRARY',
  'PLACEMENT_ALUMNI',
]

async function main() {
  const tenant = await rawPrisma.tenant.findUniqueOrThrow({ where: { slug: DEMO_SLUG } })

  await requestContext.run({ tenantId: tenant.id, userId: 'bootstrap', role: 'SUPER_ADMIN' }, async () => {
    for (const moduleId of MODULES) {
      await prisma.tenantModule.upsert({
        where: { tenantId_moduleId: { tenantId: tenant.id, moduleId } },
        update: { enabled: true },
        create: { tenantId: tenant.id, moduleId, enabled: true },
      })
      console.log(`Enabled ${moduleId} for ${DEMO_SLUG}`)
    }
  })
}

main()
  .then(() => Promise.all([prisma.$disconnect(), rawPrisma.$disconnect()]))
  .catch(async (err) => {
    console.error(err)
    await Promise.all([prisma.$disconnect(), rawPrisma.$disconnect()])
    process.exit(1)
  })
