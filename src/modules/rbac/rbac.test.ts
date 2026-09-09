import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestTenant, createTestUser, rawTestPrisma, setUpAuthenticatedTenant, TEST_PASSWORD } from '../../test/helpers'

const app = createApp()

describe('rbac routes', () => {
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

  it('lists the 9 tenant-scoped system roles with their granted permissions', async () => {
    const res = await authed(request(app).get('/api/v1/roles'))
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(9)
    const superAdmin = res.body.find((r: { name: string }) => r.name === 'SUPER_ADMIN')
    expect(superAdmin.permissions).toContain('STUDENT_READ')
    const student = res.body.find((r: { name: string }) => r.name === 'STUDENT')
    expect(student.permissions).not.toContain('STUDENT_DELETE')
  })

  it('lists the permission catalogue', async () => {
    const res = await authed(request(app).get('/api/v1/permissions'))
    expect(res.status).toBe(200)
    expect(res.body.find((p: { key: string }) => p.key === 'STUDENT_READ')).toBeTruthy()
  })

  it('reassigns a user to a different role, changing what they can access', async () => {
    const user = await createTestUser(tenant.id, 'STUDENT', 'reassign')
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD })
    const before = await request(app).get('/api/v1/departments').set('Authorization', `Bearer ${loginRes.body.token}`)
    expect(before.status).toBe(403)

    const assignRes = await authed(request(app).post(`/api/v1/users/${user.id}/role`)).send({ roleName: 'DEPARTMENT_ADMIN' })
    expect(assignRes.status).toBe(200)
    expect(assignRes.body.role).toBe('DEPARTMENT_ADMIN')

    const reLoginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD })
    const after = await request(app).get('/api/v1/departments').set('Authorization', `Bearer ${reLoginRes.body.token}`)
    expect(after.status).toBe(200)
  })

  it('rejects assigning a role that does not exist', async () => {
    const user = await createTestUser(tenant.id, 'STUDENT', 'bad-role')
    const res = await authed(request(app).post(`/api/v1/users/${user.id}/role`)).send({ roleName: 'NOT_A_REAL_ROLE' })
    expect(res.status).toBe(400)
  })
})
