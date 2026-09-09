import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as dashboardController from './dashboard.controller'

export const dashboardRouter = Router()

dashboardRouter.use(requireAuth, requireModule('CORE'), requirePermission('DASHBOARD_READ'))

dashboardRouter.get('/summary', dashboardController.summary)
dashboardRouter.get('/trend', dashboardController.trend)
dashboardRouter.get('/distribution', dashboardController.distribution)
dashboardRouter.get('/activity', dashboardController.activity)
