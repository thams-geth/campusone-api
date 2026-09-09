import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestTenant, rawTestPrisma, setUpAuthenticatedTenant, shortId } from '../../test/helpers'

const app = createApp()

describe('rooms routes', () => {
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
    const res = await request(app).get('/api/v1/rooms')
    expect(res.status).toBe(401)
  })

  it('creates a room and uppercases the code, blocking a duplicate', async () => {
    const code = shortId('rm-')
    const created = await authed(request(app).post('/api/v1/rooms')).send({ name: 'Lecture Hall 1', code })
    expect(created.status).toBe(201)
    expect(created.body.code).toBe(code.toUpperCase())

    const dup = await authed(request(app).post('/api/v1/rooms')).send({ name: 'Another', code })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('DUPLICATE_CODE')
  })
})
