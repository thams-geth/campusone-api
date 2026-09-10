import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as placementController from './placement.controller'

export const placementsRouter = Router()

placementsRouter.use(requireAuth, requireModule('PLACEMENT_ALUMNI'))

placementsRouter.get('/companies', requirePermission('PLACEMENT_READ'), placementController.listCompanies)
placementsRouter.post('/companies', requirePermission('PLACEMENT_MANAGE'), placementController.createCompany)
placementsRouter.delete('/companies/:id', requirePermission('PLACEMENT_MANAGE'), placementController.removeCompany)

placementsRouter.get('/openings', requirePermission('PLACEMENT_READ'), placementController.listOpenings)
placementsRouter.get('/openings/:id', requirePermission('PLACEMENT_READ'), placementController.getOpening)
placementsRouter.post('/openings', requirePermission('PLACEMENT_MANAGE'), placementController.createOpening)
placementsRouter.delete('/openings/:id', requirePermission('PLACEMENT_MANAGE'), placementController.removeOpening)
placementsRouter.post('/openings/:id/apply', requirePermission('PLACEMENT_APPLY'), placementController.apply)

placementsRouter.get('/applications', requirePermission('PLACEMENT_MANAGE'), placementController.listApplications)
placementsRouter.get('/applications/mine', requirePermission('PLACEMENT_READ'), placementController.listMyApplications)
placementsRouter.put('/applications/:id/status', requirePermission('PLACEMENT_MANAGE'), placementController.updateApplicationStatus)
