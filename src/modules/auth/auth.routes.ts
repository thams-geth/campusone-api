import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { env } from '../../config/env'
import { requireAuth } from '../../middleware/requireAuth'
import * as authController from './auth.controller'

// Layered on top of the app-wide limiter in app.ts — auth endpoints are
// the ones an attacker actually wants to hammer (credential stuffing,
// token guessing), so they get a tighter budget. Raised in tests only:
// the limiter's in-memory store is shared for the lifetime of the
// `createApp()` instance a test file builds once and reuses across
// every `it`, so many small login/refresh assertions in one file would
// otherwise trip it — the 20/15min production budget is untouched.
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
})

export const authRouter = Router()

authRouter.post('/login', authRateLimit, authController.login)
authRouter.post('/refresh', authRateLimit, authController.refresh)
authRouter.post('/logout', authController.logout)
authRouter.get('/me', requireAuth, authController.me)

authRouter.post('/mfa/setup', requireAuth, authController.setupMfa)
authRouter.post('/mfa/enable', requireAuth, authController.enableMfa)
authRouter.post('/mfa/disable', requireAuth, authController.disableMfa)

authRouter.get('/sessions', requireAuth, authController.listSessions)
authRouter.delete('/sessions/:id', requireAuth, authController.revokeSession)

authRouter.get('/login-history', requireAuth, authController.listLoginHistory)
