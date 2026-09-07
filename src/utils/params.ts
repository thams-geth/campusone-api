import type { Request } from 'express'
import { ApiError } from './ApiError'

/**
 * Express types a route param as `string | string[]` in general (a
 * wildcard segment like `*id` can produce an array) even though a
 * plain named segment like `:id` is always a single string. This
 * narrows it, failing loudly on the wildcard case rather than passing
 * an array where a string was expected.
 */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name]
  if (typeof value !== 'string' || value.length === 0) {
    throw ApiError.badRequest(`Missing or invalid path parameter: ${name}`)
  }
  return value
}
