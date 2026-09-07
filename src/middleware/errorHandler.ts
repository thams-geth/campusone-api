import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { ApiError } from '../utils/ApiError'
import { logger } from '../config/logger'
import { env } from '../config/env'

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' })
}

// Express identifies error middleware by arity (4 params) — _req/_next
// must stay even though unused.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(422).json({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.flatten().fieldErrors,
    })
    return
  }

  if (err instanceof ApiError) {
    if (err.status >= 500) {
      logger.error({ err }, err.message)
    }
    res.status(err.status).json({ message: err.message, code: err.code, details: err.details })
    return
  }

  logger.error({ err }, 'Unhandled error')
  res.status(500).json({
    message: 'Internal server error',
    code: 'INTERNAL_ERROR',
    // Stack traces are a reconnaissance gift to an attacker — never leak them outside dev.
    ...(env.isProduction ? {} : { stack: err instanceof Error ? err.stack : String(err) }),
  })
}
