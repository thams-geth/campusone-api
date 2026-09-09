import type { Request, Response } from 'express'
import * as dashboardService from './dashboard.service'

export async function summary(_req: Request, res: Response) {
  res.json(await dashboardService.getSummary())
}

export async function trend(_req: Request, res: Response) {
  res.json(await dashboardService.getEnrollmentTrend())
}

export async function distribution(_req: Request, res: Response) {
  res.json(await dashboardService.getDepartmentDistribution())
}

export async function activity(_req: Request, res: Response) {
  res.json(await dashboardService.getRecentActivity())
}
