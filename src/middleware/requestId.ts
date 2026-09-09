import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

const HEADER = 'x-request-id'

/**
 * Accepts a caller-supplied X-Request-ID (useful when a gateway/proxy
 * already assigns one) or generates a fresh one, and echoes it back on
 * the response. Runs before requireAuth so it's already on `req` when
 * the tenant context is established (see requireAuth.ts) and can flow
 * into the audit log (src/modules/shared/activityLog.ts).
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers[HEADER]
  const id = (Array.isArray(incoming) ? incoming[0] : incoming) || crypto.randomUUID()
  req.requestId = id
  res.setHeader('X-Request-ID', id)
  next()
}
