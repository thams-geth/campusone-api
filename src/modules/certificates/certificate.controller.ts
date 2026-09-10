import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as certificateService from './certificate.service'
import {
  certificateTypeInputSchema,
  createCertificateRequestSchema,
  listCertificateRequestsQuerySchema,
  rejectCertificateRequestSchema,
} from './certificate.schema'

export async function listTypes(_req: Request, res: Response) {
  res.json(await certificateService.listCertificateTypes())
}

export async function createType(req: Request, res: Response) {
  const input = certificateTypeInputSchema.parse(req.body)
  res.status(201).json(await certificateService.createCertificateType(req.auth!.tenantId, input))
}

export async function removeType(req: Request, res: Response) {
  await certificateService.deleteCertificateType(requireParam(req, 'id'))
  res.status(204).end()
}

export async function createRequest(req: Request, res: Response) {
  const input = createCertificateRequestSchema.parse(req.body)
  res.status(201).json(await certificateService.createRequest(req.auth!.tenantId, req.auth!.userId, input))
}

export async function listRequests(req: Request, res: Response) {
  const query = listCertificateRequestsQuerySchema.parse(req.query)
  res.json(await certificateService.listRequests(query))
}

export async function listMyRequests(req: Request, res: Response) {
  res.json(await certificateService.listMyRequests(req.auth!.userId))
}

export async function issueRequest(req: Request, res: Response) {
  res.json(await certificateService.issueRequest(requireParam(req, 'id'), req.auth!.userId))
}

export async function rejectRequest(req: Request, res: Response) {
  const input = rejectCertificateRequestSchema.parse(req.body)
  res.json(await certificateService.rejectRequest(requireParam(req, 'id'), input))
}

export async function verify(req: Request, res: Response) {
  res.json(await certificateService.verifyCertificate(requireParam(req, 'code')))
}
