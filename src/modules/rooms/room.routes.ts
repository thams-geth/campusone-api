import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as roomController from './room.controller'

export const roomsRouter = Router()

roomsRouter.use(requireAuth, requireModule('CORE'))

roomsRouter.get('/', requirePermission('ROOM_READ'), roomController.list)
roomsRouter.get('/:id', requirePermission('ROOM_READ'), roomController.getById)
roomsRouter.post('/', requirePermission('ROOM_CREATE'), roomController.create)
roomsRouter.put('/:id', requirePermission('ROOM_UPDATE'), roomController.update)
roomsRouter.delete('/:id', requirePermission('ROOM_DELETE'), roomController.remove)
