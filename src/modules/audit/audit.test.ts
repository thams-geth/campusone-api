import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestTenant, rawTestPrisma, setUpAuthenticatedTenant, shortId } from '../../test/helpers'

const app = createApp()

describe('audit-logs routes', () => {
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

  it('rejects a role without AUDIT_LOG_READ', async () => {
    const otherSetup = await setUpAuthenticatedTenant(app, 'STAFF')
    const res = await request(app).get('/api/v1/audit-logs').set('Authorization', `Bearer ${otherSetup.token}`)
    expect(res.status).toBe(403)
  })

  it('captures a structured entity/action/entityId record for a mutation', async () => {
    const created = await authed(request(app).post('/api/v1/departments')).send({
      name: 'Audit Dept',
      code: shortId('A'),
      status: 'ACTIVE',
    })

    const res = await authed(request(app).get('/api/v1/audit-logs')).query({ entity: 'Department', entityId: created.body.id })
    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({ entity: 'Department', entityId: created.body.id, action: 'CREATE' })
  })
})
