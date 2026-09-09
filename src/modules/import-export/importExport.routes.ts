import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as importExportController from './importExport.controller'

export const importExportRouter = Router()

importExportRouter.use(requireAuth, requireModule('CORE'))

importExportRouter.post('/students/preview', requirePermission('STUDENT_IMPORT'), importExportController.previewStudentImport)
importExportRouter.post('/students/commit', requirePermission('STUDENT_IMPORT'), importExportController.commitStudentImport)
importExportRouter.get('/students/export', requirePermission('STUDENT_EXPORT'), importExportController.exportStudents)
