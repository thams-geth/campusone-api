import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestTenant, createTestUser, rawTestPrisma, TEST_PASSWORD } from '../../test/helpers'
import { generateTotp } from '../../utils/totp'

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

  it('supports the full MFA setup -> enable -> login-requires-code -> verify cycle', async () => {
    const user = await createTestUser(tenant.id, 'STAFF', 'mfa-test')
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD })
    const token = loginRes.body.token as string

    const setupRes = await request(app).post('/api/v1/auth/mfa/setup').set('Authorization', `Bearer ${token}`)
    expect(setupRes.status).toBe(200)
    expect(setupRes.body.secret).toEqual(expect.any(String))
    expect(setupRes.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//)
    expect(setupRes.body.recoveryCodes).toHaveLength(10)

    const { secret, recoveryCodes } = setupRes.body as { secret: string; recoveryCodes: string[] }

    const enableWrongRes = await request(app)
      .post('/api/v1/auth/mfa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '000000' })
    expect(enableWrongRes.status).toBe(400)

    const enableRes = await request(app)
      .post('/api/v1/auth/mfa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: generateTotp(secret) })
    expect(enableRes.status).toBe(204)

    const loginNoCodeRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD })
    expect(loginNoCodeRes.status).toBe(401)
    expect(loginNoCodeRes.body.code).toBe('MFA_REQUIRED')

    const loginWrongCodeRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD, mfaCode: '000000' })
    expect(loginWrongCodeRes.status).toBe(401)
    expect(loginWrongCodeRes.body.code).toBe('MFA_INVALID')

    const loginWithCodeRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD, mfaCode: generateTotp(secret) })
    expect(loginWithCodeRes.status).toBe(200)
    const mfaToken = loginWithCodeRes.body.token as string

    const loginWithRecoveryRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD, mfaCode: recoveryCodes[0] })
    expect(loginWithRecoveryRes.status).toBe(200)

    // A recovery code is single-use.
    const loginReuseRecoveryRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD, mfaCode: recoveryCodes[0] })
    expect(loginReuseRecoveryRes.status).toBe(401)

    const disableWrongRes = await request(app)
      .post('/api/v1/auth/mfa/disable')
      .set('Authorization', `Bearer ${mfaToken}`)
      .send({ code: '000000' })
    expect(disableWrongRes.status).toBe(400)

    const disableRes = await request(app)
      .post('/api/v1/auth/mfa/disable')
      .set('Authorization', `Bearer ${mfaToken}`)
      .send({ code: generateTotp(secret) })
    expect(disableRes.status).toBe(204)

    const loginAfterDisableRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD })
    expect(loginAfterDisableRes.status).toBe(200)
  })

  it('lists and revokes sessions, and records login history', async () => {
    const user = await createTestUser(tenant.id, 'STAFF', 'session-test')
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD })
    const token = loginRes.body.token as string

    await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'wrong' })

    const sessionsRes = await request(app).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${token}`)
    expect(sessionsRes.status).toBe(200)
    expect(sessionsRes.body.length).toBeGreaterThanOrEqual(1)

    const sessionId = sessionsRes.body[0].id as string
    const revokeRes = await request(app).delete(`/api/v1/auth/sessions/${sessionId}`).set('Authorization', `Bearer ${token}`)
    expect(revokeRes.status).toBe(204)

    const historyRes = await request(app).get('/api/v1/auth/login-history').set('Authorization', `Bearer ${token}`)
    expect(historyRes.status).toBe(200)
    expect(historyRes.body.some((h: { success: boolean }) => h.success === true)).toBe(true)
    expect(historyRes.body.some((h: { success: boolean }) => h.success === false)).toBe(true)
  })
})
