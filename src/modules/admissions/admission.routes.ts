import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as admissionController from './admission.controller'

export const admissionsRouter = Router()

admissionsRouter.use(requireAuth, requireModule('ADMISSIONS'))

admissionsRouter.get('/', requirePermission('ADMISSION_READ'), admissionController.list)
admissionsRouter.get('/:id', requirePermission('ADMISSION_READ'), admissionController.getById)
admissionsRouter.post('/', requirePermission('ADMISSION_CREATE'), admissionController.create)
admissionsRouter.put('/:id', requirePermission('ADMISSION_UPDATE'), admissionController.update)
admissionsRouter.post('/:id/advance', requirePermission('ADMISSION_DECIDE'), admissionController.advance)
admissionsRouter.post('/:id/reject', requirePermission('ADMISSION_DECIDE'), admissionController.reject)
admissionsRouter.post('/:id/withdraw', requirePermission('ADMISSION_DECIDE'), admissionController.withdraw)
admissionsRouter.post('/:id/enroll', requirePermission('ADMISSION_ENROLL'), admissionController.enroll)
