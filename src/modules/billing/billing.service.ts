import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { CreateInvoiceInput, ListInvoicesQuery, SetSubscriptionInput } from './billing.schema'

/** Read-only here — the plan catalogue is platform-managed (seeded), not a tenant-facing CRUD resource (see prisma/seed.ts): a tenant admin creating "global" plans would pollute a resource every other tenant sees. */
export async function listPlans() {
  return prisma.plan.findMany({ orderBy: { priceMonthly: 'asc' } })
}

export async function getSubscription(tenantId: string) {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } })
  if (!subscription) throw ApiError.notFound('No subscription found for this tenant')
  return subscription
}

/** Creates or changes the CALLER'S OWN tenant's subscription — never another tenant's, since this always reads tenantId from the authenticated context. */
export async function setSubscription(tenantId: string, input: SetSubscriptionInput) {
  const plan = await prisma.plan.findUnique({ where: { id: input.planId } })
  if (!plan) throw ApiError.badRequest('Plan not found.', { planId: ['Invalid plan'] })

  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const subscription = await prisma.subscription.upsert({
    where: { tenantId },
    update: { planId: plan.id, status: 'ACTIVE', cancelAtPeriodEnd: false },
    create: {
      tenantId,
      planId: plan.id,
      status: 'TRIALING',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    include: { plan: true },
  })
  await logActivity(`set the subscription plan to ${plan.name}`, { entity: 'Subscription', entityId: subscription.id, action: 'UPDATE' })
  return subscription
}

export async function cancelSubscription(tenantId: string) {
  const existing = await prisma.subscription.findUnique({ where: { tenantId } })
  if (!existing) throw ApiError.notFound('No subscription found for this tenant')

  const subscription = await prisma.subscription.update({
    where: { tenantId },
    data: { cancelAtPeriodEnd: true },
    include: { plan: true },
  })
  await logActivity('scheduled the subscription to cancel at period end', { entity: 'Subscription', entityId: subscription.id, action: 'CANCEL' })
  return subscription
}

export async function listInvoices(tenantId: string, params: ListInvoicesQuery) {
  const { page, pageSize, status } = params
  const where = { tenantId, ...(status ? { status } : {}) }

  const [data, total] = await Promise.all([
    prisma.billingInvoice.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { periodStart: 'desc' } }),
    prisma.billingInvoice.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function createInvoice(tenantId: string, input: CreateInvoiceInput) {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } })
  if (!subscription) throw ApiError.badRequest('This tenant has no subscription to invoice.', { tenantId: ['No subscription'] })

  const invoice = await prisma.billingInvoice.create({
    data: {
      tenantId,
      subscriptionId: subscription.id,
      amount: input.amount ?? subscription.plan.priceMonthly,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    },
  })
  await logActivity('created a billing invoice', { entity: 'BillingInvoice', entityId: invoice.id, action: 'CREATE' })
  return invoice
}

export async function payInvoice(id: string) {
  const invoice = await prisma.billingInvoice.findUnique({ where: { id } })
  if (!invoice) throw ApiError.notFound('Invoice not found')
  if (invoice.status === 'PAID') throw ApiError.conflict('This invoice is already paid.', 'ALREADY_PAID')

  const updated = await prisma.billingInvoice.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } })
  await logActivity('marked a billing invoice paid', { entity: 'BillingInvoice', entityId: id, action: 'PAY' })
  return updated
}

/** Computed on read, not stored — same reasoning as Fees' invoice status and Examinations' SGPA. */
export async function getUsage(tenantId: string) {
  const [subscription, studentCount, facultyCount] = await Promise.all([
    prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } }),
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.faculty.count({ where: { status: 'ACTIVE' } }),
  ])

  return {
    plan: subscription?.plan.name ?? null,
    students: { used: studentCount, limit: subscription?.plan.studentLimit ?? null },
    faculty: { used: facultyCount, limit: subscription?.plan.facultyLimit ?? null },
  }
}
