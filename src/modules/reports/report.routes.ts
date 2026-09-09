import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as reportController from './report.controller'

export const reportsRouter = Router()

reportsRouter.use(requireAuth, requireModule('CORE'), requirePermission('REPORTS_READ'))

reportsRouter.get('/student-strength', reportController.studentStrength)
reportsRouter.get('/attendance', reportController.attendance)
reportsRouter.get('/department-performance', reportController.departmentPerformance)
reportsRouter.get('/subject-performance', reportController.subjectPerformance)
reportsRouter.get('/exam-results', reportController.examResults)
reportsRouter.get('/faculty-workload', reportController.facultyWorkload)
