import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestTenant, rawTestPrisma, setUpAuthenticatedTenant } from '../../test/helpers'

const app = createApp()

describe('integration routes', () => {
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
    const res = await request(app).get('/api/v1/integrations')
    expect(res.status).toBe(401)
  })

  it('starts with no configured integrations', async () => {
    const res = await authed(request(app).get('/api/v1/integrations'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('rejects an unknown provider', async () => {
    const res = await authed(request(app).put('/api/v1/integrations/NOT_A_PROVIDER')).send({ enabled: true })
    expect(res.status).toBe(422)
  })

  it('configures and re-configures a provider (config only, no live call)', async () => {
    const enableRes = await authed(request(app).put('/api/v1/integrations/EMAIL')).send({
      enabled: true,
      settings: { fromAddress: 'noreply@example.com' },
    })
    expect(enableRes.status).toBe(200)
    expect(enableRes.body).toMatchObject({ provider: 'EMAIL', enabled: true, settings: { fromAddress: 'noreply@example.com' } })

    const listRes = await authed(request(app).get('/api/v1/integrations'))
    expect(listRes.status).toBe(200)
    expect(listRes.body).toHaveLength(1)

    const disableRes = await authed(request(app).put('/api/v1/integrations/EMAIL')).send({ enabled: false })
    expect(disableRes.status).toBe(200)
    expect(disableRes.body.enabled).toBe(false)

    // Still exactly one row per (tenant, provider) — an upsert, not a new row.
    const listAfterRes = await authed(request(app).get('/api/v1/integrations'))
    expect(listAfterRes.body).toHaveLength(1)
  })
})
