import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import rateLimit from 'express-rate-limit'
import swaggerUi from 'swagger-ui-express'
import YAML from 'yaml'
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
import { attendanceRouter } from './modules/attendance/attendance.routes'
import { leaveRouter } from './modules/leave/leave.routes'
import { assignmentsRouter } from './modules/assignments/assignment.routes'
import { examinationsRouter } from './modules/examinations/examination.routes'
import { announcementsRouter } from './modules/announcements/announcement.routes'
import { documentsRouter } from './modules/documents/document.routes'
import { reportsRouter } from './modules/reports/report.routes'
import { importExportRouter } from './modules/import-export/importExport.routes'
import { admissionsRouter } from './modules/admissions/admission.routes'
import { feesRouter } from './modules/fees/fee.routes'
import { hostelRouter } from './modules/hostel/hostel.routes'
import { transportRouter } from './modules/transport/transport.routes'
import { libraryRouter } from './modules/library/library.routes'
import { certificatesRouter } from './modules/certificates/certificate.routes'
import { activitiesRouter } from './modules/activities/activity.routes'
import { placementsRouter } from './modules/placements/placement.routes'
import { billingRouter } from './modules/billing/billing.routes'
import { apiKeysRouter } from './modules/api-keys/apiKey.routes'
import { webhooksRouter } from './modules/webhooks/webhook.routes'
import { integrationsRouter } from './modules/integrations/integration.routes'
import { approvalsRouter } from './modules/approvals/approval.routes'
import { notificationsRouter } from './modules/notifications/notification.routes'
import { classGroupsRouter } from './modules/class-groups/classGroup.routes'

// Loaded once at module scope, not per-request — the spec is static
// repo content, not something that changes at runtime.
const openApiDocument = YAML.parse(fs.readFileSync(path.join(__dirname, '../docs/openapi.yaml'), 'utf8')) as object

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

  // Interactive API reference — unversioned, like health checks.
  // /api/docs.json exposes the raw spec (e.g. for Postman import).
  app.get('/api/docs.json', (_req, res) => {
    res.json(openApiDocument)
  })
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'CampusOne API Docs' }))

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
  v1.use('/attendance', attendanceRouter)
  v1.use('/leave', leaveRouter)
  v1.use('/assignments', assignmentsRouter)
  v1.use('/examinations', examinationsRouter)
  v1.use('/announcements', announcementsRouter)
  v1.use('/documents', documentsRouter)
  v1.use('/reports', reportsRouter)
  v1.use('/import-export', importExportRouter)
  v1.use('/admissions', admissionsRouter)
  v1.use('/fees', feesRouter)
  v1.use('/hostel', hostelRouter)
  v1.use('/transport', transportRouter)
  v1.use('/library', libraryRouter)
  v1.use('/certificates', certificatesRouter)
  v1.use('/activities', activitiesRouter)
  v1.use('/placements', placementsRouter)
  v1.use('/billing', billingRouter)
  v1.use('/api-keys', apiKeysRouter)
  v1.use('/webhooks', webhooksRouter)
  v1.use('/integrations', integrationsRouter)
  v1.use('/approvals', approvalsRouter)
  v1.use('/notifications', notificationsRouter)
  v1.use('/class-groups', classGroupsRouter)
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
