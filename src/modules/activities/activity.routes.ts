import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as activityController from './activity.controller'

export const activitiesRouter = Router()

activitiesRouter.use(requireAuth, requireModule('CORE'))

activitiesRouter.get('/', requirePermission('ACTIVITY_MANAGE'), activityController.list)
activitiesRouter.get('/mine', requirePermission('ACTIVITY_READ'), activityController.listMine)
activitiesRouter.get('/:id', requirePermission('ACTIVITY_READ'), activityController.getById)
activitiesRouter.post('/', requirePermission('ACTIVITY_MANAGE', 'ACTIVITY_SELF_REPORT'), activityController.create)
activitiesRouter.put('/:id', requirePermission('ACTIVITY_MANAGE'), activityController.update)
activitiesRouter.delete('/:id', requirePermission('ACTIVITY_MANAGE'), activityController.remove)
