import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import { listSubjectsQuerySchema, subjectInputSchema } from './subject.schema'
import * as subjectService from './subject.service'

export async function list(req: Request, res: Response) {
  const query = listSubjectsQuerySchema.parse(req.query)
  res.json(await subjectService.listSubjects(query))
}

export async function getById(req: Request, res: Response) {
  res.json(await subjectService.getSubject(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = subjectInputSchema.parse(req.body)
  res.status(201).json(await subjectService.createSubject(req.auth!.tenantId, input))
}

export async function update(req: Request, res: Response) {
  const input = subjectInputSchema.parse(req.body)
  res.json(await subjectService.updateSubject(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await subjectService.deleteSubject(requireParam(req, 'id'))
  res.status(204).end()
}
