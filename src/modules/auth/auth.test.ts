import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestTenant, createTestUser, rawTestPrisma, TEST_PASSWORD } from '../../test/helpers'

const app = createApp()

describe('auth routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let userEmail: string

  beforeAll(async () => {
    tenant = await createTestTenant('Auth Test')
    const user = await createTestUser(tenant.id, 'SUPER_ADMIN', 'auth-test')
    userEmail = user.email
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function extractRefreshCookie(res: request.Response): string {
    const raw = res.headers['set-cookie']
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : []
    const cookie = cookies.find((c: string) => c.startsWith('refreshToken='))
    if (!cookie) throw new Error('No refreshToken cookie in response')
    return cookie.split(';')[0]
  }

  it('rejects a malformed login body with a validation error', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' })
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('rejects invalid credentials with a generic message', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: userEmail, password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Invalid email or password.')
  })

  it('does not reveal whether the email exists', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody-at-all@example.com', password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Invalid email or password.')
  })

  it('logs in with valid credentials and sets an httpOnly refresh cookie', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: userEmail, password: TEST_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.user).toMatchObject({ email: userEmail, role: 'SUPER_ADMIN' })
    expect(res.body.user).not.toHaveProperty('passwordHash')

    const setCookie = res.headers['set-cookie']?.[0] ?? res.headers['set-cookie']
    expect(String(setCookie)).toMatch(/refreshToken=.*HttpOnly/i)
  })

  it('locks the account after repeated failed attempts', async () => {
    const user = await createTestUser(tenant.id, 'STAFF', 'lockout-test')

    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'wrong' })
    }

    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'wrong' })
    expect(res.status).toBe(429)
  })

  it('supports the full login -> refresh -> logout -> refresh-fails cycle', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: userEmail, password: TEST_PASSWORD })
    const firstCookie = extractRefreshCookie(loginRes)

    const refreshRes = await request(app).post('/api/v1/auth/refresh').set('Cookie', firstCookie)
    expect(refreshRes.status).toBe(200)
    expect(refreshRes.body.token).toEqual(expect.any(String))
    const secondCookie = extractRefreshCookie(refreshRes)
    expect(secondCookie).not.toBe(firstCookie)

    // The first refresh token was rotated (revoked) — reusing it must fail.
    const reuseRes = await request(app).post('/api/v1/auth/refresh').set('Cookie', firstCookie)
    expect(reuseRes.status).toBe(401)

    const logoutRes = await request(app).post('/api/v1/auth/logout').set('Cookie', secondCookie)
    expect(logoutRes.status).toBe(204)

    const afterLogoutRes = await request(app).post('/api/v1/auth/refresh').set('Cookie', secondCookie)
    expect(afterLogoutRes.status).toBe(401)
  })

  it('rejects /me without a token', async () => {
    const res = await request(app).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
  })

  it('rejects /me with a garbage token', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-real-token')
    expect(res.status).toBe(401)
  })

  it('returns the current user for /me with a valid token', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: userEmail, password: TEST_PASSWORD })
    const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${loginRes.body.token}`)

    expect(meRes.status).toBe(200)
    expect(meRes.body.user.email).toBe(userEmail)
  })
})
