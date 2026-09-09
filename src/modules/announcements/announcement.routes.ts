import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as announcementController from './announcement.controller'

export const announcementsRouter = Router()

announcementsRouter.use(requireAuth, requireModule('COMMUNICATION'))

announcementsRouter.get('/', requirePermission('ANNOUNCEMENT_READ'), announcementController.list)
announcementsRouter.get('/feed', requirePermission('ANNOUNCEMENT_READ'), announcementController.feed)
announcementsRouter.get('/:id', requirePermission('ANNOUNCEMENT_READ'), announcementController.getById)
announcementsRouter.post('/', requirePermission('ANNOUNCEMENT_MANAGE'), announcementController.create)
announcementsRouter.put('/:id', requirePermission('ANNOUNCEMENT_MANAGE'), announcementController.update)
announcementsRouter.delete('/:id', requirePermission('ANNOUNCEMENT_MANAGE'), announcementController.remove)
