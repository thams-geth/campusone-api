import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as admissionService from './admission.service'
import {
  admissionApplicationInputSchema,
  advanceApplicationSchema,
  enrollApplicationSchema,
  listAdmissionsQuerySchema,
} from './admission.schema'

export async function list(req: Request, res: Response) {
  const query = listAdmissionsQuerySchema.parse(req.query)
  res.json(await admissionService.listApplications(query))
}

export async function getById(req: Request, res: Response) {
  res.json(await admissionService.getApplication(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = admissionApplicationInputSchema.parse(req.body)
  res.status(201).json(await admissionService.createApplication(req.auth!.tenantId, input))
}

export async function update(req: Request, res: Response) {
  const input = admissionApplicationInputSchema.parse(req.body)
  res.json(await admissionService.updateApplication(requireParam(req, 'id'), input))
}

export async function advance(req: Request, res: Response) {
  const input = advanceApplicationSchema.parse(req.body)
  res.json(await admissionService.advanceApplication(requireParam(req, 'id'), req.auth!.userId, input))
}

export async function reject(req: Request, res: Response) {
  const input = advanceApplicationSchema.parse(req.body)
  res.json(await admissionService.rejectApplication(requireParam(req, 'id'), req.auth!.userId, input))
}

export async function withdraw(req: Request, res: Response) {
  res.json(await admissionService.withdrawApplication(requireParam(req, 'id')))
}

export async function enroll(req: Request, res: Response) {
  const input = enrollApplicationSchema.parse(req.body)
  res.status(201).json(await admissionService.enrollApplication(req.auth!.tenantId, requireParam(req, 'id'), input))
}
