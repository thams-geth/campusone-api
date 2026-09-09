import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import rateLimit from 'express-rate-limit'
import { env } from './config/env'
import { logger } from './config/logger'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import { requestId } from './middleware/requestId'
import { prisma } from './prisma/client'
import { authRouter } from './modules/auth/auth.routes'
import { departmentsRouter } from './modules/departments/department.routes'
import { studentsRouter } from './modules/students/student.routes'
import { dashboardRouter } from './modules/dashboard/dashboard.routes'
import { academicYearsRouter } from './modules/academic-years/academicYear.routes'
import { programsRouter } from './modules/programs/program.routes'
import { batchesRouter } from './modules/batches/batch.routes'
import { sectionsRouter } from './modules/sections/section.routes'
import { subjectsRouter } from './modules/subjects/subject.routes'
import { facultyRouter } from './modules/faculty/faculty.routes'
import { roomsRouter } from './modules/rooms/room.routes'
import { timetableRouter } from './modules/timetable/timetable.routes'
import { institutionRouter } from './modules/institution/institution.routes'
import { rbacRouter } from './modules/rbac/rbac.routes'
import { auditRouter } from './modules/audit/audit.routes'

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
  app.use(requestId)
  app.use(pinoHttp({ logger, autoLogging: !env.isTest, genReqId: (req) => req.requestId ?? '' }))

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

  // Health checks stay unversioned and outside /api/v1 — infra (load
  // balancers, k8s probes) shouldn't need updating when the API
  // version changes.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })
  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' })
  })
  app.get('/health/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({ status: 'ok' })
    } catch {
      res.status(503).json({ status: 'unavailable' })
    }
  })

  const v1 = express.Router()
  v1.use('/auth', authRouter)
  v1.use('/departments', departmentsRouter)
  v1.use('/students', studentsRouter)
  v1.use('/dashboard', dashboardRouter)
  v1.use('/academic-years', academicYearsRouter)
  v1.use('/programs', programsRouter)
  v1.use('/batches', batchesRouter)
  v1.use('/sections', sectionsRouter)
  v1.use('/subjects', subjectsRouter)
  v1.use('/faculty', facultyRouter)
  v1.use('/rooms', roomsRouter)
  v1.use('/timetable', timetableRouter)
  v1.use('/institution', institutionRouter)
  v1.use('/audit-logs', auditRouter)
  // Roles/permissions admin surface — its own routes (/roles,
  // /permissions, /users/:id/role) rather than one resource prefix.
  v1.use(rbacRouter)

  // Further feature module routers mount here as they're built — must
  // come before the 404/error handlers below.
  app.use('/api/v1', v1)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
