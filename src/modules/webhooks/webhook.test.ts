import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app'
import { createTestDepartment, createTestTenant, rawTestPrisma, setUpAuthenticatedTenant } from '../../test/helpers'

const app = createApp()

describe('webhook routes', () => {
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
    const res = await request(app).get('/api/v1/webhooks')
    expect(res.status).toBe(401)
  })

  it('rejects a non-https URL', async () => {
    const res = await authed(request(app).post('/api/v1/webhooks')).send({
      url: 'http://example.com/hook',
      eventTypes: ['student.created'],
    })
    expect(res.status).toBe(400)
  })

  it('rejects a URL resolving to a private IP (SSRF guard)', async () => {
    const res = await authed(request(app).post('/api/v1/webhooks')).send({
      url: 'https://localhost/hook',
      eventTypes: ['student.created'],
    })
    expect(res.status).toBe(400)
  })

  it('registers an endpoint, and delivers a matching event to it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    const createRes = await authed(request(app).post('/api/v1/webhooks')).send({
      url: 'https://example.com/hook',
      eventTypes: ['student.created'],
    })
    expect(createRes.status).toBe(201)
    expect(createRes.body).not.toHaveProperty('secret', undefined)
    const endpointId = createRes.body.id as string

    const department = await createTestDepartment(tenant.id)
    const studentRes = await authed(request(app).post('/api/v1/students')).send({
      firstName: 'Web',
      lastName: 'Hook',
      email: `webhook-${Date.now()}@example.com`,
      phone: '+91 9000000001',
      rollNumber: `WH${Date.now()}`,
      departmentId: department.id,
      gender: 'OTHER',
      dateOfBirth: '2003-01-01',
      admissionDate: '2023-06-01',
      status: 'ACTIVE',
    })
    expect(studentRes.status).toBe(201)

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Webhook-Event': 'student.created' }),
      }),
    )

    const deliveriesRes = await authed(request(app).get(`/api/v1/webhooks/${endpointId}/deliveries`))
    expect(deliveriesRes.status).toBe(200)
    expect(deliveriesRes.body.data.length).toBeGreaterThanOrEqual(1)
    expect(deliveriesRes.body.data[0].status).toBe('DELIVERED')

    fetchSpy.mockRestore()
  })

  it('updates and deletes an endpoint', async () => {
    const createRes = await authed(request(app).post('/api/v1/webhooks')).send({
      url: 'https://example.com/other-hook',
      eventTypes: ['fee.invoice.paid'],
    })
    const endpointId = createRes.body.id as string

    const updateRes = await authed(request(app).patch(`/api/v1/webhooks/${endpointId}`)).send({ enabled: false })
    expect(updateRes.status).toBe(200)
    expect(updateRes.body.enabled).toBe(false)

    const deleteRes = await authed(request(app).delete(`/api/v1/webhooks/${endpointId}`))
    expect(deleteRes.status).toBe(204)

    const getRes = await authed(request(app).get(`/api/v1/webhooks/${endpointId}/deliveries`))
    expect(getRes.status).toBe(404)
  })
})
