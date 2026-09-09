import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as timetableController from './timetable.controller'

export const timetableRouter = Router()

// Timetable is the one Milestone-1 module gated behind ACADEMICS rather
// than CORE — see CLAUDE.md's module list.
timetableRouter.use(requireAuth, requireModule('ACADEMICS'))

timetableRouter.get('/', requirePermission('TIMETABLE_READ'), timetableController.list)
timetableRouter.get('/:id', requirePermission('TIMETABLE_READ'), timetableController.getById)
timetableRouter.post('/', requirePermission('TIMETABLE_CREATE'), timetableController.create)
timetableRouter.put('/:id', requirePermission('TIMETABLE_UPDATE'), timetableController.update)
timetableRouter.delete('/:id', requirePermission('TIMETABLE_DELETE'), timetableController.remove)
