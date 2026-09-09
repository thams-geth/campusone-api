import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestTenant, rawTestPrisma, setUpAuthenticatedTenant } from '../../test/helpers'

const app = createApp()

describe('institution routes', () => {
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
    const res = await request(app).get('/api/v1/institution')
    expect(res.status).toBe(401)
  })

  it('returns and updates the current tenant only', async () => {
    const getRes = await authed(request(app).get('/api/v1/institution'))
    expect(getRes.status).toBe(200)
    expect(getRes.body.id).toBe(tenant.id)

    const putRes = await authed(request(app).put('/api/v1/institution')).send({ name: 'Renamed College', primaryColor: '#1677FF' })
    expect(putRes.status).toBe(200)
    expect(putRes.body.name).toBe('Renamed College')
    expect(putRes.body.primaryColor).toBe('#1677FF')
  })

  it('rejects an invalid hex color', async () => {
    const res = await authed(request(app).put('/api/v1/institution')).send({ name: 'Still Valid Name', primaryColor: 'blue' })
    expect(res.status).toBe(422)
  })
})
