import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as timetableController from './timetable.controller'
import * as periodSlotController from './periodSlot.controller'

export const timetableRouter = Router()

// Timetable is the one Milestone-1 module gated behind ACADEMICS rather
// than CORE — see CLAUDE.md's module list.
timetableRouter.use(requireAuth, requireModule('ACADEMICS'))

// The institution's shared bell schedule (Period 1, Break, Period 2, ...) —
// reuses the TIMETABLE_* permissions rather than a new set, since
// configuring it is part of managing the timetable, not a separate concern.
// Registered before '/:id' so 'periods' isn't swallowed as an entry id.
timetableRouter.get('/periods', requirePermission('TIMETABLE_READ'), periodSlotController.list)
timetableRouter.post('/periods', requirePermission('TIMETABLE_CREATE'), periodSlotController.create)
timetableRouter.put('/periods/:id', requirePermission('TIMETABLE_UPDATE'), periodSlotController.update)
timetableRouter.delete('/periods/:id', requirePermission('TIMETABLE_DELETE'), periodSlotController.remove)

timetableRouter.get('/', requirePermission('TIMETABLE_READ'), timetableController.list)
timetableRouter.get('/:id', requirePermission('TIMETABLE_READ'), timetableController.getById)
timetableRouter.post('/', requirePermission('TIMETABLE_CREATE'), timetableController.create)
timetableRouter.put('/:id', requirePermission('TIMETABLE_UPDATE'), timetableController.update)
timetableRouter.delete('/:id', requirePermission('TIMETABLE_DELETE'), timetableController.remove)
