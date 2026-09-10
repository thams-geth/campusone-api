import type { Request, Response } from 'express'
import { env } from '../../config/env'
import { ApiError } from '../../utils/ApiError'
import { requireParam } from '../../utils/params'
import { loginSchema, mfaCodeSchema } from './auth.schema'
import * as authService from './auth.service'

const REFRESH_COOKIE_NAME = 'refreshToken'
// Scoped to /api/v1/auth: the cookie only needs to be sent to the
// login/refresh/logout/me routes, not every API request.
const REFRESH_COOKIE_PATH = '/api/v1/auth'

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    // Assumes the frontend reaches this API same-site in production
    // (same parent domain or a reverse proxy) and via a dev-server
    // proxy locally — see README for why `secure: true` + cross-origin
    // fetch doesn't work from a bare http://localhost setup.
    secure: env.isProduction,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  })
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH })
}

export async function login(req: Request, res: Response) {
  const { email, password, mfaCode } = loginSchema.parse(req.body)
  const userAgent = req.headers['user-agent']
  const result = await authService.login(email, password, {
    mfaCode,
    ipAddress: req.ip,
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
  })

  setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt)
  res.json({ user: result.user, token: result.accessToken })
}

export async function refresh(req: Request, res: Response) {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME]
  if (!rawRefreshToken) {
    throw ApiError.unauthorized('Session expired. Please sign in again.')
  }

  const result = await authService.refresh(rawRefreshToken)
  setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt)
  res.json({ token: result.accessToken })
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE_NAME])
  clearRefreshCookie(res)
  res.status(204).end()
}

export async function me(req: Request, res: Response) {
  // requireAuth guarantees req.auth is set before this handler runs.
  const user = await authService.getCurrentUser(req.auth!.userId)
  res.json({ user })
}

export async function setupMfa(req: Request, res: Response) {
  const result = await authService.setupMfa(req.auth!.userId)
  res.json(result)
}

export async function enableMfa(req: Request, res: Response) {
  const { code } = mfaCodeSchema.parse(req.body)
  await authService.enableMfa(req.auth!.userId, code)
  res.status(204).end()
}

export async function disableMfa(req: Request, res: Response) {
  const { code } = mfaCodeSchema.parse(req.body)
  await authService.disableMfa(req.auth!.userId, code)
  res.status(204).end()
}

export async function listSessions(req: Request, res: Response) {
  const sessions = await authService.listSessions(req.auth!.userId)
  res.json(sessions)
}

export async function revokeSession(req: Request, res: Response) {
  await authService.revokeSession(req.auth!.userId, requireParam(req, 'id'))
  res.status(204).end()
}

export async function listLoginHistory(req: Request, res: Response) {
  const history = await authService.listLoginHistory(req.auth!.userId)
  res.json(history)
}
