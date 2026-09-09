import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as attendanceController from './attendance.controller'

export const attendanceRouter = Router()

attendanceRouter.use(requireAuth, requireModule('ACADEMICS'))

attendanceRouter.get('/sessions', requirePermission('ATTENDANCE_READ'), attendanceController.listSessions)
attendanceRouter.get('/sessions/:id', requirePermission('ATTENDANCE_READ'), attendanceController.getSession)
attendanceRouter.post('/sessions', requirePermission('ATTENDANCE_MARK'), attendanceController.createSession)
attendanceRouter.put('/sessions/:id/records', requirePermission('ATTENDANCE_MARK', 'ATTENDANCE_EDIT'), attendanceController.markRecords)
attendanceRouter.post('/sessions/:id/submit', requirePermission('ATTENDANCE_MARK'), attendanceController.submitSession)
attendanceRouter.post('/sessions/:id/lock', requirePermission('ATTENDANCE_APPROVE'), attendanceController.lockSession)

attendanceRouter.get('/student/:studentId', requirePermission('ATTENDANCE_READ'), attendanceController.listByStudent)
attendanceRouter.get('/section/:sectionId', requirePermission('ATTENDANCE_READ'), attendanceController.listBySection)
attendanceRouter.get('/subject/:subjectId', requirePermission('ATTENDANCE_READ'), attendanceController.listBySubject)

attendanceRouter.post('/records/:id/correction', requirePermission('ATTENDANCE_MARK', 'ATTENDANCE_EDIT'), attendanceController.requestCorrection)
attendanceRouter.get('/corrections', requirePermission('ATTENDANCE_READ'), attendanceController.listCorrections)
attendanceRouter.post('/corrections/:id/approve', requirePermission('ATTENDANCE_APPROVE'), attendanceController.approveCorrection)
attendanceRouter.post('/corrections/:id/reject', requirePermission('ATTENDANCE_APPROVE'), attendanceController.rejectCorrection)
