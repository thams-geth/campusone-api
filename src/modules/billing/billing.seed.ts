import { prisma } from '../../prisma/client'

/**
 * The plan catalogue (roadmap #32's FREE/PRO/ENTERPRISE example) —
 * global reference data, like the permission catalogue, not a
 * tenant-facing CRUD resource. Idempotent; safe to call on every app
 * boot or from prisma/seed.ts. Requires SOME request context to run
 * through the tenant-scoped extension, same as seedGlobalRbac — Plan
 * has no RLS (global), so any tenant's context works harmlessly.
 */
export async function seedPlanCatalogue(): Promise<void> {
  const plans = [
    { name: 'FREE', studentLimit: 500, facultyLimit: 5, priceMonthly: 0, description: 'Basic reports, up to 500 students' },
    { name: 'PRO', studentLimit: 5000, facultyLimit: 50, priceMonthly: 9999, description: 'Advanced reports and notifications, up to 5,000 students' },
    { name: 'ENTERPRISE', studentLimit: 1000000, facultyLimit: 100000, priceMonthly: 49999, description: 'Custom limits, SSO, advanced integrations, dedicated support' },
  ]

  for (const plan of plans) {
    await prisma.plan.upsert({ where: { name: plan.name }, update: {}, create: plan })
  }
}
