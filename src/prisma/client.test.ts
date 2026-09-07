import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '../config/env'
import { prisma } from './client'
import { requestContext } from './tenantContext'

/**
 * Proves Row-Level Security actually isolates tenants at the database
 * level — not just that our application code happens to filter
 * correctly. Requires a real Postgres with the RLS migration applied
 * (`docker compose up -d && npm run prisma:migrate`).
 */
describe('tenant isolation (RLS)', () => {
  // Deliberately the same non-superuser role the running API uses
  // (APP_DATABASE_URL), not the migration-owner DATABASE_URL — a
  // superuser connection bypasses RLS unconditionally, which would make
  // every test below pass regardless of whether RLS is set up correctly.
  const rawPrisma = new PrismaClient({ adapter: new PrismaPg(env.APP_DATABASE_URL) })
  let tenantA: { id: string }
  let tenantB: { id: string }

  beforeAll(async () => {
    tenantA = await rawPrisma.tenant.create({
      data: { name: 'RLS Test College A', slug: `rls-test-a-${Date.now()}` },
    })
    tenantB = await rawPrisma.tenant.create({
      data: { name: 'RLS Test College B', slug: `rls-test-b-${Date.now()}` },
    })
  })

  afterAll(async () => {
    // Cascades to any departments/students/etc. created under these tenants.
    await rawPrisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } })
    await rawPrisma.$disconnect()
  })

  it('lets tenant A see the department it created, scoped through the app client', async () => {
    const created = await requestContext.run(
      { tenantId: tenantA.id, userId: 'user-a', role: 'SUPER_ADMIN' },
      // Prisma promises are lazy — they don't actually run until
      // awaited, so the await must happen INSIDE the run() callback or
      // AsyncLocalStorage loses the context by the time it executes.
      async () => await prisma.department.create({ data: { tenantId: tenantA.id, name: 'CSE', code: `CSE-${Date.now()}` } }),
    )

    const found = await requestContext.run(
      { tenantId: tenantA.id, userId: 'user-a', role: 'SUPER_ADMIN' },
      async () => await prisma.department.findUnique({ where: { id: created.id } }),
    )

    expect(found?.id).toBe(created.id)
  })

  it("does not let tenant B see tenant A's department through the app client", async () => {
    const created = await requestContext.run(
      { tenantId: tenantA.id, userId: 'user-a', role: 'SUPER_ADMIN' },
      async () => await prisma.department.create({ data: { tenantId: tenantA.id, name: 'ECE', code: `ECE-${Date.now()}` } }),
    )

    const asTenantB = await requestContext.run(
      { tenantId: tenantB.id, userId: 'user-b', role: 'SUPER_ADMIN' },
      async () => await prisma.department.findMany({ where: { tenantId: tenantA.id } }),
    )

    // Note: filtering by tenantA.id explicitly and still getting nothing
    // back proves RLS, not just that our WHERE clause was scoped right.
    expect(asTenantB.find((d) => d.id === created.id)).toBeUndefined()
  })

  it('enforces isolation at the database level even for a raw query with no app-level filter', async () => {
    const created = await requestContext.run(
      { tenantId: tenantA.id, userId: 'user-a', role: 'SUPER_ADMIN' },
      async () => await prisma.department.create({ data: { tenantId: tenantA.id, name: 'MECH', code: `MECH-${Date.now()}` } }),
    )

    // Raw connection, RLS session var pointed at tenant B, and a query
    // with NO tenant filter at all — this is the real test of the DB
    // guarantee, independent of whether our JS wrapper is correct.
    await rawPrisma.$transaction([
      rawPrisma.$executeRaw`SELECT set_config('app.current_tenant', ${tenantB.id}, TRUE)`,
      rawPrisma.$queryRaw`SELECT 1`,
    ])
    const rows = await rawPrisma.$transaction([
      rawPrisma.$executeRaw`SELECT set_config('app.current_tenant', ${tenantB.id}, TRUE)`,
      rawPrisma.$queryRaw`SELECT * FROM "Department" WHERE id = ${created.id}`,
    ])

    expect(rows[1]).toEqual([])
  })

  it('fails closed (zero rows) when app.current_tenant is never set at all', async () => {
    const rows = await rawPrisma.$queryRaw`SELECT * FROM "Department" WHERE "tenantId" = ${tenantA.id}`
    expect(rows).toEqual([])
  })

  it('throws instead of silently querying unscoped when there is no request context', async () => {
    await expect(prisma.department.findMany()).rejects.toThrow(/no request context/i)
  })
})
