import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as placementService from './placement.service'
import {
  applyToJobSchema,
  companyInputSchema,
  jobOpeningInputSchema,
  listApplicationsQuerySchema,
  listJobOpeningsQuerySchema,
  updateApplicationStatusSchema,
} from './placement.schema'

export async function listCompanies(_req: Request, res: Response) {
  res.json(await placementService.listCompanies())
}

export async function createCompany(req: Request, res: Response) {
  const input = companyInputSchema.parse(req.body)
  res.status(201).json(await placementService.createCompany(req.auth!.tenantId, input))
}

export async function removeCompany(req: Request, res: Response) {
  await placementService.deleteCompany(requireParam(req, 'id'))
  res.status(204).end()
}

export async function listOpenings(req: Request, res: Response) {
  const query = listJobOpeningsQuerySchema.parse(req.query)
  res.json(await placementService.listJobOpenings(query))
}

export async function getOpening(req: Request, res: Response) {
  res.json(await placementService.getJobOpening(requireParam(req, 'id')))
}

export async function createOpening(req: Request, res: Response) {
  const input = jobOpeningInputSchema.parse(req.body)
  res.status(201).json(await placementService.createJobOpening(req.auth!.tenantId, input))
}

export async function removeOpening(req: Request, res: Response) {
  await placementService.deleteJobOpening(requireParam(req, 'id'))
  res.status(204).end()
}

export async function apply(req: Request, res: Response) {
  const input = applyToJobSchema.parse(req.body)
  res.status(201).json(await placementService.applyToJob(req.auth!.tenantId, req.auth!.userId, requireParam(req, 'id'), input))
}

export async function listApplications(req: Request, res: Response) {
  const query = listApplicationsQuerySchema.parse(req.query)
  res.json(await placementService.listApplications(query))
}

export async function listMyApplications(req: Request, res: Response) {
  res.json(await placementService.listMyApplications(req.auth!.userId))
}

export async function updateApplicationStatus(req: Request, res: Response) {
  const input = updateApplicationStatusSchema.parse(req.body)
  res.json(await placementService.updateApplicationStatus(requireParam(req, 'id'), input))
}
