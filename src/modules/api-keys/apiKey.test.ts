import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestTenant, createTestUser, rawTestPrisma, setUpAuthenticatedTenant, TEST_PASSWORD } from '../../test/helpers'

const app = createApp()

describe('api key routes', () => {
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
    const res = await request(app).get('/api/v1/api-keys')
    expect(res.status).toBe(401)
  })

  it('creates a key, lists it without the raw secret, and authenticates a request with it', async () => {
    const createRes = await authed(request(app).post('/api/v1/api-keys')).send({ name: 'CI integration' })
    expect(createRes.status).toBe(201)
    expect(createRes.body.key).toEqual(expect.any(String))
    const rawKey = createRes.body.key as string

    const listRes = await authed(request(app).get('/api/v1/api-keys'))
    expect(listRes.status).toBe(200)
    expect(listRes.body).toHaveLength(1)
    expect(listRes.body[0]).not.toHaveProperty('key')
    expect(listRes.body[0]).not.toHaveProperty('keyHash')
    expect(listRes.body[0].keyPrefix).toEqual(expect.any(String))

    const meRes = await request(app).get('/api/v1/auth/me').set('X-API-Key', rawKey)
    expect(meRes.status).toBe(200)
    expect(meRes.body.user.role).toBe('SUPER_ADMIN')
  })

  it('rejects an invalid or unknown API key', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('X-API-Key', 'cok_not-a-real-key')
    expect(res.status).toBe(401)
  })

  it('revokes a key, after which it can no longer authenticate', async () => {
    const createRes = await authed(request(app).post('/api/v1/api-keys')).send({ name: 'To be revoked' })
    const rawKey = createRes.body.key as string
    const keyId = createRes.body.id as string

    const revokeRes = await authed(request(app).delete(`/api/v1/api-keys/${keyId}`))
    expect(revokeRes.status).toBe(204)

    const meRes = await request(app).get('/api/v1/auth/me').set('X-API-Key', rawKey)
    expect(meRes.status).toBe(401)
  })

  it('a created key inherits the creating user\'s exact role, not a separate scope', async () => {
    const collegeAdmin = await createTestUser(tenant.id, 'COLLEGE_ADMIN', 'apikey-admin')
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: collegeAdmin.email, password: TEST_PASSWORD })
    const adminToken = loginRes.body.token as string

    const createRes = await request(app)
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'College admin key' })
    expect(createRes.status).toBe(201)
    const rawKey = createRes.body.key as string

    const meRes = await request(app).get('/api/v1/auth/me').set('X-API-Key', rawKey)
    expect(meRes.status).toBe(200)
    expect(meRes.body.user.role).toBe('COLLEGE_ADMIN')
  })

  it('API keys are a platform-tier concern — STAFF cannot create one at all', async () => {
    const staff = await createTestUser(tenant.id, 'STAFF', 'apikey-staff')
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: staff.email, password: TEST_PASSWORD })
    const staffToken = loginRes.body.token as string

    const createRes = await request(app)
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Staff key' })
    expect(createRes.status).toBe(403)
  })
})
