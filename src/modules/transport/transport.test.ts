import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../app'
import { createTestDepartment, createTestStudent, createTestTenant, enableModule, rawTestPrisma, setUpAuthenticatedTenant } from '../../test/helpers'

const app = createApp()

describe('transport routes', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>
  let token: string
  let departmentId: string

  beforeAll(async () => {
    const setup = await setUpAuthenticatedTenant(app)
    tenant = setup.tenant
    token = setup.token
    await enableModule(tenant.id, 'HOSTEL_TRANSPORT')

    const department = await createTestDepartment(tenant.id)
    departmentId = department.id
  })

  afterAll(async () => {
    await rawTestPrisma.tenant.delete({ where: { id: tenant.id } })
    await rawTestPrisma.$disconnect()
  })

  function authed(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`)
  }

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/transport/routes')
    expect(res.status).toBe(401)
  })

  it('creates a vehicle, route, and stop, then allocates and removes a student', async () => {
    const vehicle = await authed(request(app).post('/api/v1/transport/vehicles')).send({
      registrationNumber: 'KA-01-AB-1234',
      driverName: 'Ravi Kumar',
      driverPhone: '+91 9000000000',
      capacity: 40,
    })
    expect(vehicle.status).toBe(201)

    const route = await authed(request(app).post('/api/v1/transport/routes')).send({ name: 'Route 1', vehicleId: vehicle.body.id })
    const stop = await authed(request(app).post(`/api/v1/transport/routes/${route.body.id}/stops`)).send({ name: 'Main Gate', sequence: 1 })

    const student = await createTestStudent(tenant.id, departmentId)
    const allocation = await authed(request(app).post('/api/v1/transport/allocations')).send({
      studentId: student.id,
      routeId: route.body.id,
      stopId: stop.body.id,
    })
    expect(allocation.status).toBe(201)

    const dup = await authed(request(app).post('/api/v1/transport/allocations')).send({
      studentId: student.id,
      routeId: route.body.id,
      stopId: stop.body.id,
    })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('ALREADY_ALLOCATED')

    const removed = await authed(request(app).post(`/api/v1/transport/allocations/${allocation.body.id}/remove`))
    expect(removed.status).toBe(200)
    expect(removed.body.status).toBe('INACTIVE')

    // Even a vacated (INACTIVE) allocation still blocks deletion — the
    // FK is RESTRICT regardless of status, so this is real history.
    const stopDelete = await authed(request(app).delete(`/api/v1/transport/stops/${stop.body.id}`))
    expect(stopDelete.status).toBe(409)
    expect(stopDelete.body.code).toBe('STOP_IN_USE')
  })

  it('blocks a duplicate stop sequence on the same route', async () => {
    const route = await authed(request(app).post('/api/v1/transport/routes')).send({ name: 'Route 2' })
    await authed(request(app).post(`/api/v1/transport/routes/${route.body.id}/stops`)).send({ name: 'Stop A', sequence: 1 })
    const dup = await authed(request(app).post(`/api/v1/transport/routes/${route.body.id}/stops`)).send({ name: 'Stop B', sequence: 1 })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('DUPLICATE_SEQUENCE')
  })
})
