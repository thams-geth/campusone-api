/**
 * Thrown anywhere in a route/service to produce a consistent error
 * response. Express 5 forwards rejected promises from async handlers to
 * the error middleware automatically, so routes can just `throw`.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(message: string, status = 400, code = 'BAD_REQUEST', details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(message, 400, 'BAD_REQUEST', details)
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(message, 401, 'UNAUTHORIZED')
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(message, 403, 'FORBIDDEN')
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(message, 404, 'NOT_FOUND')
  }

  static conflict(message: string, code = 'CONFLICT') {
    return new ApiError(message, 409, code)
  }

  static tooManyRequests(message: string) {
    return new ApiError(message, 429, 'TOO_MANY_REQUESTS')
  }

  static internal(message = 'Internal server error') {
    return new ApiError(message, 500, 'INTERNAL_ERROR')
  }
}
