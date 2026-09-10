import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestDepartment, createTestStudent, createTestTenant, rawTestPrisma, setUpAuthenticatedTenant } from '../../test/helpers'

const app = createApp()

describe('billing routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/billing/plans')
    expect(res.status).toBe(401)
  })

  it('lists the seeded plan catalogue', async () => {
    const res = await authed(request(app).get('/api/v1/billing/plans'))
    expect(res.status).toBe(200)
    expect(res.body.map((p: { name: string }) => p.name)).toEqual(expect.arrayContaining(['FREE', 'PRO', 'ENTERPRISE']))
  })

  it('404s a subscription before one is set', async () => {
    const res = await authed(request(app).get('/api/v1/billing/subscription'))
    expect(res.status).toBe(404)
  })

  it('sets a subscription, tracks usage against the plan limit, invoices, and pays', async () => {
    const plans = await authed(request(app).get('/api/v1/billing/plans'))
    const freePlan = plans.body.find((p: { name: string }) => p.name === 'FREE')

    const subscription = await authed(request(app).put('/api/v1/billing/subscription')).send({ planId: freePlan.id })
    expect(subscription.status).toBe(200)
    expect(subscription.body.plan.name).toBe('FREE')

    const department = await createTestDepartment(tenant.id)
    await createTestStudent(tenant.id, department.id)
    await createTestStudent(tenant.id, department.id)

    const usage = await authed(request(app).get('/api/v1/billing/usage'))
    expect(usage.status).toBe(200)
    expect(usage.body.students).toMatchObject({ used: 2, limit: freePlan.studentLimit })

    const invoice = await authed(request(app).post('/api/v1/billing/invoices')).send({
      periodStart: '2024-01-01',
      periodEnd: '2024-01-31',
    })
    expect(invoice.status).toBe(201)
    expect(invoice.body.amount).toBe(freePlan.priceMonthly)
    expect(invoice.body.status).toBe('PENDING')

    const paid = await authed(request(app).post(`/api/v1/billing/invoices/${invoice.body.id}/pay`))
    expect(paid.status).toBe(200)
    expect(paid.body.status).toBe('PAID')

    const doublePay = await authed(request(app).post(`/api/v1/billing/invoices/${invoice.body.id}/pay`))
    expect(doublePay.status).toBe(409)
    expect(doublePay.body.code).toBe('ALREADY_PAID')

    const canceled = await authed(request(app).post('/api/v1/billing/subscription/cancel'))
    expect(canceled.status).toBe(200)
    expect(canceled.body.cancelAtPeriodEnd).toBe(true)
  })
})
