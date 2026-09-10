import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestDepartment,
  createTestStudentUser,
  createTestTenant,
  enableModule,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  TEST_PASSWORD,
} from '../../test/helpers'

const app = createApp()

describe('library routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let adminToken: string
  let studentToken: string
  let studentId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    adminToken = setup.token
    await enableModule(tenant.id, 'LIBRARY')

    const department = await createTestDepartment(tenant.id)
    const { student, user } = await createTestStudentUser(tenant.id, department.id)
    studentId = student.id
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: TEST_PASSWORD })
    studentToken = loginRes.body.token
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function asAdmin(req: request.Test) {
    return req.set('Authorization', `Bearer ${adminToken}`)
  }
  function asStudent(req: request.Test) {
    return req.set('Authorization', `Bearer ${studentToken}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/library/books')
    expect(res.status).toBe(401)
  })

  it('tracks availableCopies through issue and return, and blocks issuing when none are left', async () => {
    const book = await asAdmin(request(app).post('/api/v1/library/books')).send({
      title: 'Clean Code',
      author: 'Robert Martin',
      totalCopies: 1,
    })
    expect(book.body.availableCopies).toBe(1)

    const issued = await asAdmin(request(app).post('/api/v1/library/issues')).send({
      bookId: book.body.id,
      ownerType: 'STUDENT',
      ownerId: studentId,
      dueDate: '2099-01-01',
    })
    expect(issued.status).toBe(201)

    const afterIssue = await asAdmin(request(app).get(`/api/v1/library/books/${book.body.id}`))
    expect(afterIssue.body.availableCopies).toBe(0)

    const blocked = await asAdmin(request(app).post('/api/v1/library/issues')).send({
      bookId: book.body.id,
      ownerType: 'STUDENT',
      ownerId: studentId,
      dueDate: '2099-01-01',
    })
    expect(blocked.status).toBe(409)
    expect(blocked.body.code).toBe('NO_COPIES_AVAILABLE')

    const returned = await asAdmin(request(app).post(`/api/v1/library/issues/${issued.body.id}/return`))
    expect(returned.status).toBe(200)
    expect(returned.body.fineAmount).toBeNull()

    const afterReturn = await asAdmin(request(app).get(`/api/v1/library/books/${book.body.id}`))
    expect(afterReturn.body.availableCopies).toBe(1)

    const mine = await asStudent(request(app).get('/api/v1/library/issues/mine'))
    expect(mine.status).toBe(200)
    expect(mine.body).toHaveLength(1)

    const forbiddenRoster = await asStudent(request(app).get('/api/v1/library/issues'))
    expect(forbiddenRoster.status).toBe(403)
  })

  it('computes a fine for a book returned past its due date', async () => {
    const book = await asAdmin(request(app).post('/api/v1/library/books')).send({
      title: 'Overdue Book',
      author: 'Someone',
      totalCopies: 1,
    })
    const pastDue = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const issued = await asAdmin(request(app).post('/api/v1/library/issues')).send({
      bookId: book.body.id,
      ownerType: 'STUDENT',
      ownerId: studentId,
      dueDate: pastDue,
    })

    const returned = await asAdmin(request(app).post(`/api/v1/library/issues/${issued.body.id}/return`))
    expect(returned.status).toBe(200)
    expect(returned.body.fineAmount).toBeGreaterThan(0)
  })
})
