import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as examinationController from './examination.controller'

export const examinationsRouter = Router()

examinationsRouter.use(requireAuth, requireModule('EXAMINATION'))

examinationsRouter.get('/exams', requirePermission('EXAM_READ'), examinationController.listExams)
examinationsRouter.get('/exams/:id', requirePermission('EXAM_READ'), examinationController.getExam)
examinationsRouter.post('/exams', requirePermission('EXAM_MANAGE'), examinationController.createExam)
examinationsRouter.put('/exams/:id', requirePermission('EXAM_MANAGE'), examinationController.updateExam)
examinationsRouter.delete('/exams/:id', requirePermission('EXAM_MANAGE'), examinationController.removeExam)

examinationsRouter.get('/exams/:id/schedules', requirePermission('EXAM_READ'), examinationController.listSchedules)
examinationsRouter.post('/exams/:id/schedules', requirePermission('EXAM_MANAGE'), examinationController.createSchedule)
examinationsRouter.put('/schedules/:id', requirePermission('EXAM_MANAGE'), examinationController.updateSchedule)
examinationsRouter.delete('/schedules/:id', requirePermission('EXAM_MANAGE'), examinationController.removeSchedule)

const staffTier = requirePermission('MARKS_ENTER', 'MARKS_VERIFY', 'MARKS_PUBLISH')
examinationsRouter.post('/schedules/:id/marks', requirePermission('MARKS_ENTER'), examinationController.enterMarks)
// Full-roster marks view is staff-only — students use /results/*, which is
// always scoped to their own record and PUBLISHED-only (see the service).
examinationsRouter.get('/schedules/:id/marks', staffTier, examinationController.listMarks)
examinationsRouter.post('/schedules/:id/marks/submit', requirePermission('MARKS_ENTER'), examinationController.submitMarks)
examinationsRouter.post('/schedules/:id/marks/verify', requirePermission('MARKS_VERIFY'), examinationController.verifyMarks)
examinationsRouter.post('/schedules/:id/marks/publish', requirePermission('MARKS_PUBLISH'), examinationController.publishMarks)

examinationsRouter.put('/marks/:id', requirePermission('MARKS_EDIT'), examinationController.editMarks)
examinationsRouter.put('/marks/:id/revise', requirePermission('MARKS_REVISE'), examinationController.reviseMarks)

examinationsRouter.get('/results/semester/:semesterNumber', requirePermission('MARKS_READ'), examinationController.getSemesterResult)
examinationsRouter.get('/results/cgpa', requirePermission('MARKS_READ'), examinationController.getCgpa)
