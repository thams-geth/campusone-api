import { PrismaPg } from '@prisma/adapter-pg'
import { DepartmentStatus, PrismaClient, type Role } from '@prisma/client'
import request from 'supertest'
import type { Express } from 'express'
import { env } from '../config/env'
import { prisma } from '../prisma/client'
import { requestContext } from '../prisma/tenantContext'
import { hashPassword } from '../modules/auth/auth.service'

/** Codes/slugs are length-capped in the schema — keep test identifiers short. */
export function shortId(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

export const rawTestPrisma = new PrismaClient({ adapter: new PrismaPg(env.APP_DATABASE_URL) })

export const TEST_PASSWORD = 'Passw0rd!'

export async function createTestTenant(namePrefix: string) {
  return rawTestPrisma.tenant.create({
    data: { name: `${namePrefix} College`, slug: `${namePrefix.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  })
}

export async function createTestUser(tenantId: string, role: Role, emailPrefix: string) {
  const passwordHash = await hashPassword(TEST_PASSWORD)
  // Must await the Prisma call INSIDE this callback (Prisma promises are
  // lazy, so a bare `() => prisma.x()` loses the AsyncLocalStorage
  // context by the time it actually runs — see src/prisma/client.ts).
  return requestContext.run({ tenantId, userId: 'bootstrap', role: 'SUPER_ADMIN' }, async () =>
    await prisma.user.create({
      data: {
        tenantId,
        name: `${emailPrefix} Test User`,
        email: `${emailPrefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`,
        passwordHash,
        role,
        isActive: true,
      },
    }),
  )
}

export async function createTestDepartment(
  tenantId: string,
  overrides: Partial<{ name: string; code: string; status: DepartmentStatus }> = {},
) {
  return requestContext.run({ tenantId, userId: 'bootstrap', role: 'SUPER_ADMIN' }, async () =>
    await prisma.department.create({
      data: {
        tenantId,
        name: overrides.name ?? 'Test Department',
        code: overrides.code ?? shortId('D'),
        status: overrides.status ?? DepartmentStatus.ACTIVE,
      },
    }),
  )
}

/** Creates a tenant + an admin user, and logs in for a bearer token. */
export async function setUpAuthenticatedTenant(app: Express, role: Role = 'SUPER_ADMIN') {
  const tenant = await createTestTenant('Auth Helper')
  const user = await createTestUser(tenant.id, role, 'helper')
  const loginRes = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })
  return { tenant, user, token: loginRes.body.token as string }
}
