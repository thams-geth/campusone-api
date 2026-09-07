import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../../middleware/requireAuth'
import * as authController from './auth.controller'

// Layered on top of the app-wide limiter in app.ts — auth endpoints are
// the ones an attacker actually wants to hammer (credential stuffing,
// token guessing), so they get a tighter budget.
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

export const authRouter = Router()

authRouter.post('/login', authRateLimit, authController.login)
authRouter.post('/refresh', authRateLimit, authController.refresh)
authRouter.post('/logout', authController.logout)
authRouter.get('/me', requireAuth, authController.me)
