import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import {
  createTestAcademicYear,
  createTestDepartment,
  createTestProgram,
  createTestStudentUser,
  createTestTenant,
  enableModule,
  rawTestPrisma,
  setUpAuthenticatedTenant,
  TEST_PASSWORD,
} from '../../test/helpers'

const app = createApp()

describe('fees routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let adminToken: string
  let studentToken: string
  let studentId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    adminToken = setup.token
    await enableModule(tenant.id, 'FINANCE')

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
    const res = await request(app).get('/api/v1/fees/invoices/mine')
    expect(res.status).toBe(401)
  })

  it('creates an invoice and recomputes status through partial payment, adjustment, then full payment', async () => {
    const invoice = await asAdmin(request(app).post('/api/v1/fees/invoices')).send({
      studentId,
      category: 'TUITION',
      amount: 10000,
      dueDate: '2099-01-01',
    })
    expect(invoice.status).toBe(201)
    expect(invoice.body.status).toBe('PENDING')
    const invoiceId = invoice.body.id

    const partial = await asAdmin(request(app).post(`/api/v1/fees/invoices/${invoiceId}/payments`)).send({
      amount: 4000,
      method: 'CASH',
    })
    expect(partial.status).toBe(201)

    const afterPartial = await asAdmin(request(app).get(`/api/v1/fees/invoices/${invoiceId}`))
    expect(afterPartial.body.status).toBe('PARTIAL')

    // A 6000 scholarship on top of the 6000 remaining should fully cover it.
    const adjusted = await asAdmin(request(app).post(`/api/v1/fees/invoices/${invoiceId}/adjustments`)).send({
      type: 'SCHOLARSHIP',
      amount: 6000,
      reason: 'Merit scholarship',
    })
    expect(adjusted.status).toBe(200)
    expect(adjusted.body.status).toBe('PAID')

    const blockedPayment = await asAdmin(request(app).post(`/api/v1/fees/invoices/${invoiceId}/payments`)).send({
      amount: 100,
      method: 'CASH',
    })
    expect(blockedPayment.status).toBe(409)
    expect(blockedPayment.body.code).toBe('INVOICE_SETTLED')

    const mine = await asStudent(request(app).get('/api/v1/fees/invoices/mine'))
    expect(mine.status).toBe(200)
    expect(mine.body.find((i: { id: string }) => i.id === invoiceId)).toBeTruthy()

    const forbiddenRoster = await asStudent(request(app).get('/api/v1/fees/invoices'))
    expect(forbiddenRoster.status).toBe(403)
  })

  it('refunds a payment and recomputes the invoice back out of PAID', async () => {
    const invoice = await asAdmin(request(app).post('/api/v1/fees/invoices')).send({
      studentId,
      category: 'EXAM',
      amount: 500,
      dueDate: '2099-01-01',
    })
    const payment = await asAdmin(request(app).post(`/api/v1/fees/invoices/${invoice.body.id}/payments`)).send({
      amount: 500,
      method: 'UPI',
    })
    expect((await asAdmin(request(app).get(`/api/v1/fees/invoices/${invoice.body.id}`))).body.status).toBe('PAID')

    const refund = await asAdmin(request(app).post(`/api/v1/fees/payments/${payment.body.id}/refund`)).send({
      amount: 500,
      reason: 'Duplicate payment',
    })
    expect(refund.status).toBe(201)

    const afterRefund = await asAdmin(request(app).get(`/api/v1/fees/invoices/${invoice.body.id}`))
    expect(afterRefund.body.status).toBe('PENDING')
  })

  it('blocks a duplicate fee structure for the same program/year/category', async () => {
    const department = await createTestDepartment(tenant.id, { code: 'FEED1' })
    const program = await createTestProgram(tenant.id, department.id, { code: 'FEEP1' })
    const academicYear = await createTestAcademicYear(tenant.id)

    await asAdmin(request(app).post('/api/v1/fees/structures')).send({
      programId: program.id,
      academicYearId: academicYear.id,
      category: 'HOSTEL',
      amount: 5000,
    })
    const dup = await asAdmin(request(app).post('/api/v1/fees/structures')).send({
      programId: program.id,
      academicYearId: academicYear.id,
      category: 'HOSTEL',
      amount: 6000,
    })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('DUPLICATE_STRUCTURE')
  })
})
