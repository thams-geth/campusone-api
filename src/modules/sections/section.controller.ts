import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import { listSectionsQuerySchema, sectionInputSchema } from './section.schema'
import * as sectionService from './section.service'

export async function list(req: Request, res: Response) {
  const query = listSectionsQuerySchema.parse(req.query)
  res.json(await sectionService.listSections(query))
}

export async function getById(req: Request, res: Response) {
  res.json(await sectionService.getSection(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = sectionInputSchema.parse(req.body)
  res.status(201).json(await sectionService.createSection(req.auth!.tenantId, input))
}

export async function update(req: Request, res: Response) {
  const input = sectionInputSchema.parse(req.body)
  res.json(await sectionService.updateSection(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await sectionService.deleteSection(requireParam(req, 'id'))
  res.status(204).end()
}
