import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import { facultyCreateSchema, facultyUpdateSchema, listFacultyQuerySchema } from './faculty.schema'
import * as facultyService from './faculty.service'

export async function list(req: Request, res: Response) {
  const query = listFacultyQuerySchema.parse(req.query)
  res.json(await facultyService.listFaculty(query))
}

export async function getById(req: Request, res: Response) {
  res.json(await facultyService.getFaculty(requireParam(req, 'id')))
}

export async function get360(req: Request, res: Response) {
  res.json(await facultyService.getFaculty360(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = facultyCreateSchema.parse(req.body)
  res.status(201).json(await facultyService.createFaculty(req.auth!.tenantId, input))
}

export async function update(req: Request, res: Response) {
  const input = facultyUpdateSchema.parse(req.body)
  res.json(await facultyService.updateFaculty(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await facultyService.deleteFaculty(requireParam(req, 'id'))
  res.status(204).end()
}
