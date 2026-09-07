import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import rateLimit from 'express-rate-limit'
import { env } from './config/env'
import { logger } from './config/logger'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import { authRouter } from './modules/auth/auth.routes'

export function createApp() {
  const app = express()

  // Trust one hop of proxy (load balancer/reverse proxy) so req.ip and
  // express-rate-limit see the real client IP instead of the proxy's.
  app.set('trust proxy', 1)

  app.use(helmet())
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  )
  app.use(cookieParser())
  app.use(express.json({ limit: '1mb' }))
  app.use(pinoHttp({ logger, autoLogging: !env.isTest }))

  // Baseline throttle on every route; auth routes layer a stricter limit
  // on top of this in their own module.
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/api/auth', authRouter)

  // Further feature module routers mount here as they're built — must
  // come before the 404/error handlers below.

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
