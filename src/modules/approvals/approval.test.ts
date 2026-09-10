import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestTenant, rawTestPrisma, setUpAuthenticatedTenant } from '../../test/helpers'

const app = createApp()

describe('approval routes', () => {
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
    const res = await request(app).get('/api/v1/approvals')
    expect(res.status).toBe(401)
  })

  it('supports the full request -> approve lifecycle', async () => {
    const createRes = await authed(request(app).post('/api/v1/approvals')).send({
      type: 'CUSTOM_DEMO',
      entity: 'DemoThing',
      entityId: 'demo-1',
      reason: 'Needs a second pair of eyes.',
    })
    expect(createRes.status).toBe(201)
    expect(createRes.body.status).toBe('PENDING')
    const id = createRes.body.id as string

    const listRes = await authed(request(app).get('/api/v1/approvals?status=PENDING'))
    expect(listRes.status).toBe(200)
    expect(listRes.body.data.some((a: { id: string }) => a.id === id)).toBe(true)

    const approveRes = await authed(request(app).post(`/api/v1/approvals/${id}/approve`)).send({ decisionNotes: 'Looks good.' })
    expect(approveRes.status).toBe(200)
    expect(approveRes.body.status).toBe('APPROVED')
    expect(approveRes.body.decisionNotes).toBe('Looks good.')

    // Already decided — can't decide it again.
    const rejectAfterRes = await authed(request(app).post(`/api/v1/approvals/${id}/reject`)).send({})
    expect(rejectAfterRes.status).toBe(409)
    expect(rejectAfterRes.body.code).toBe('ALREADY_DECIDED')
  })

  it('supports rejecting a request', async () => {
    const createRes = await authed(request(app).post('/api/v1/approvals')).send({
      type: 'CUSTOM_DEMO',
      entity: 'DemoThing',
      entityId: 'demo-2',
    })
    const id = createRes.body.id as string

    const rejectRes = await authed(request(app).post(`/api/v1/approvals/${id}/reject`)).send({ decisionNotes: 'Not this time.' })
    expect(rejectRes.status).toBe(200)
    expect(rejectRes.body.status).toBe('REJECTED')
  })
})
