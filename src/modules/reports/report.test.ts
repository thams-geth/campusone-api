import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestDepartment,
  createTestFaculty,
  createTestStudent,
  createTestTenant,
  enableModule,
  setUpAuthenticatedTenant,
  rawTestPrisma,
} from '../../test/helpers'

const app = createApp()

describe('reports routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string
  let departmentId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token

    const department = await createTestDepartment(tenant.id)
    departmentId = department.id
    await createTestStudent(tenant.id, department.id)
    await createTestStudent(tenant.id, department.id)
    await createTestFaculty(tenant.id, department.id)
    await enableModule(tenant.id, 'FINANCE')
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/reports/student-strength')
    expect(res.status).toBe(401)
  })

  it('reports student strength scoped to a department', async () => {
    const res = await authed(request(app).get('/api/v1/reports/student-strength')).query({ departmentId })
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.byDepartment[0]).toMatchObject({ departmentId, count: 2 })
  })

  it('reports faculty workload with zero assignments for a fresh faculty member', async () => {
    const res = await authed(request(app).get('/api/v1/reports/faculty-workload'))
    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({ subjectsAssigned: 0, weeklyPeriods: 0 })
  })

  it('404s exam-results for an unknown exam', async () => {
    const res = await authed(request(app).get('/api/v1/reports/exam-results')).query({ examId: 'does-not-exist' })
    expect(res.status).toBe(404)
  })

  it('reports a financial summary of invoiced/collected/outstanding, by category', async () => {
    const student = await createTestStudent(tenant.id, departmentId)

    const invoiceRes = await authed(request(app).post('/api/v1/fees/invoices')).send({
      studentId: student.id,
      category: 'TUITION',
      amount: 1000,
      dueDate: '2025-01-01',
    })
    expect(invoiceRes.status).toBe(201)
    const invoiceId = invoiceRes.body.id as string

    const payRes = await authed(request(app).post(`/api/v1/fees/invoices/${invoiceId}/payments`)).send({
      amount: 400,
      method: 'CASH',
    })
    expect(payRes.status).toBe(201)

    const res = await authed(request(app).get('/api/v1/reports/financial-summary'))
    expect(res.status).toBe(200)
    expect(res.body.totalInvoiced).toBeGreaterThanOrEqual(1000)
    expect(res.body.totalCollected).toBeGreaterThanOrEqual(400)
    const tuitionBucket = res.body.byCategory.find((c: { category: string }) => c.category === 'TUITION')
    expect(tuitionBucket).toMatchObject({ invoiced: 1000, collected: 400, outstanding: 600 })
  })

  it('reports dropout — students INACTIVE without reaching ALUMNI', async () => {
    const student = await createTestStudent(tenant.id, departmentId, { rollNumber: `DROP${Date.now()}` })

    const updateRes = await authed(request(app).put(`/api/v1/students/${student.id}`)).send({
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      phone: student.phone,
      rollNumber: student.rollNumber,
      departmentId: student.departmentId,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth,
      admissionDate: student.admissionDate,
      status: 'INACTIVE',
    })
    expect(updateRes.status).toBe(200)

    const res = await authed(request(app).get('/api/v1/reports/dropout'))
    expect(res.status).toBe(200)
    expect(res.body.total).toBeGreaterThanOrEqual(1)
    expect(res.body.students.every((s: { id: string }) => s.id)).toBe(true)
  })
})
