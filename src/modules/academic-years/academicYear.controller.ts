import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import { academicYearInputSchema, listAcademicYearsQuerySchema } from './academicYear.schema'
import * as academicYearService from './academicYear.service'

export async function list(req: Request, res: Response) {
  const query = listAcademicYearsQuerySchema.parse(req.query)
  res.json(await academicYearService.listAcademicYears(query))
}

export async function getById(req: Request, res: Response) {
  res.json(await academicYearService.getAcademicYear(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = academicYearInputSchema.parse(req.body)
  res.status(201).json(await academicYearService.createAcademicYear(req.auth!.tenantId, input))
}

export async function update(req: Request, res: Response) {
  const input = academicYearInputSchema.parse(req.body)
  res.json(await academicYearService.updateAcademicYear(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await academicYearService.deleteAcademicYear(requireParam(req, 'id'))
  res.status(204).end()
}
