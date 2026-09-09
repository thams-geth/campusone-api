import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as documentService from './document.service'
import { documentInputSchema, listDocumentsQuerySchema } from './document.schema'

export async function list(req: Request, res: Response) {
  const query = listDocumentsQuerySchema.parse(req.query)
  res.json(await documentService.listDocuments(query))
}

export async function listMine(req: Request, res: Response) {
  res.json(await documentService.listMyDocuments(req.auth!.userId))
}

export async function getById(req: Request, res: Response) {
  res.json(await documentService.getDocument(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = documentInputSchema.parse(req.body)
  res.status(201).json(await documentService.createDocument(req.auth!.tenantId, req.auth!.userId, input))
}

export async function update(req: Request, res: Response) {
  const input = documentInputSchema.parse(req.body)
  res.json(await documentService.updateDocument(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await documentService.deleteDocument(requireParam(req, 'id'))
  res.status(204).end()
}

export async function verify(req: Request, res: Response) {
  res.json(await documentService.reviewDocument(requireParam(req, 'id'), req.auth!.userId, 'VERIFIED'))
}

export async function reject(req: Request, res: Response) {
  res.json(await documentService.reviewDocument(requireParam(req, 'id'), req.auth!.userId, 'REJECTED'))
}
