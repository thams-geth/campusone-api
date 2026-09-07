import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'

describe('app', () => {
  const app = createApp()

  it('responds to a health check', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/nope')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})
