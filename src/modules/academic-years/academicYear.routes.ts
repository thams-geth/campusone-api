import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as academicYearController from './academicYear.controller'

export const academicYearsRouter = Router()

academicYearsRouter.use(requireAuth, requireModule('CORE'))

academicYearsRouter.get('/', requirePermission('ACADEMIC_YEAR_READ'), academicYearController.list)
academicYearsRouter.get('/:id', requirePermission('ACADEMIC_YEAR_READ'), academicYearController.getById)
academicYearsRouter.post('/', requirePermission('ACADEMIC_YEAR_CREATE'), academicYearController.create)
academicYearsRouter.put('/:id', requirePermission('ACADEMIC_YEAR_UPDATE'), academicYearController.update)
academicYearsRouter.delete('/:id', requirePermission('ACADEMIC_YEAR_DELETE'), academicYearController.remove)
