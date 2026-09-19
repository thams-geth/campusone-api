import { Router } from 'express'
import { requireAuth } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as searchController from './search.controller'

export const searchRouter = Router()

// No single requirePermission gate here — which categories a caller
// sees depends on which permissions their role holds, checked per
// category inside the service (see search.service.ts globalSearch).
searchRouter.use(requireAuth, requireModule('CORE'))

searchRouter.get('/', searchController.search)
