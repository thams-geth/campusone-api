import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { env } from '../../config/env'
import { prisma } from '../../prisma/client'
import { requestContext } from '../../prisma/tenantContext'
import { hashPassword } from './auth.service'

const app = createApp()
const rawPrisma = new PrismaClient({ adapter: new PrismaPg(env.APP_DATABASE_URL) })

const PASSWORD = 'Passw0rd!'

describe('auth routes', () => {
  let tenant: { id: string }
  let userEmail: string

  beforeAll(async () => {
    tenant = await rawPrisma.tenant.create({
      data: { name: 'Auth Test College', slug: `auth-test-${Date.now()}` },
    })
    userEmail = `auth.test.${Date.now()}@example.com`

    await requestContext.run({ tenantId: tenant.id, userId: 'bootstrap', role: 'SUPER_ADMIN' }, async () => {
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          name: 'Auth Test User',
          email: userEmail,
          passwordHash: await hashPassword(PASSWORD),
          role: 'SUPER_ADMIN',
          isActive: true,
        },
      })
    })
  })

  afterAll(async () => {
    await rawPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawPrisma.$disconnect()
  })

  function extractRefreshCookie(res: request.Response): string {
    const raw = res.headers['set-cookie']
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : []
    const cookie = cookies.find((c: string) => c.startsWith('refreshToken='))
    if (!cookie) throw new Error('No refreshToken cookie in response')
    return cookie.split(';')[0]
  }

  it('rejects a malformed login body with a validation error', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' })
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('rejects invalid credentials with a generic message', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: userEmail, password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Invalid email or password.')
  })

  it('does not reveal whether the email exists', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody-at-all@example.com', password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Invalid email or password.')
  })

  it('logs in with valid credentials and sets an httpOnly refresh cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: userEmail, password: PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.user).toMatchObject({ email: userEmail, role: 'SUPER_ADMIN' })
    expect(res.body.user).not.toHaveProperty('passwordHash')

    const setCookie = res.headers['set-cookie']?.[0] ?? res.headers['set-cookie']
    expect(String(setCookie)).toMatch(/refreshToken=.*HttpOnly/i)
  })

  it('locks the account after repeated failed attempts', async () => {
    const email = `lockout.${Date.now()}@example.com`
    await requestContext.run({ tenantId: tenant.id, userId: 'bootstrap', role: 'SUPER_ADMIN' }, async () => {
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          name: 'Lockout Test',
          email,
          passwordHash: await hashPassword(PASSWORD),
          role: 'STAFF',
          isActive: true,
        },
      })
    })

    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email, password: 'wrong' })
    }

    const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong' })
    expect(res.status).toBe(429)
  })

  it('supports the full login -> refresh -> logout -> refresh-fails cycle', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ email: userEmail, password: PASSWORD })
    const firstCookie = extractRefreshCookie(loginRes)

    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie)
    expect(refreshRes.status).toBe(200)
    expect(refreshRes.body.token).toEqual(expect.any(String))
    const secondCookie = extractRefreshCookie(refreshRes)
    expect(secondCookie).not.toBe(firstCookie)

    // The first refresh token was rotated (revoked) — reusing it must fail.
    const reuseRes = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie)
    expect(reuseRes.status).toBe(401)

    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', secondCookie)
    expect(logoutRes.status).toBe(204)

    const afterLogoutRes = await request(app).post('/api/auth/refresh').set('Cookie', secondCookie)
    expect(afterLogoutRes.status).toBe(401)
  })

  it('rejects /me without a token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('rejects /me with a garbage token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token')
    expect(res.status).toBe(401)
  })

  it('returns the current user for /me with a valid token', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ email: userEmail, password: PASSWORD })
    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${loginRes.body.token}`)

    expect(meRes.status).toBe(200)
    expect(meRes.body.user.email).toBe(userEmail)
  })
})
