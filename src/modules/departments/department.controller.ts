import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import { departmentInputSchema, listDepartmentsQuerySchema } from './department.schema'
import * as departmentService from './department.service'

export async function list(req: Request, res: Response) {
  const query = listDepartmentsQuerySchema.parse(req.query)
  res.json(await departmentService.listDepartments(query))
}

export async function getById(req: Request, res: Response) {
  res.json(await departmentService.getDepartment(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = departmentInputSchema.parse(req.body)
  res.status(201).json(await departmentService.createDepartment(req.auth!.tenantId, input))
}

export async function update(req: Request, res: Response) {
  const input = departmentInputSchema.parse(req.body)
  res.json(await departmentService.updateDepartment(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await departmentService.deleteDepartment(requireParam(req, 'id'))
  res.status(204).end()
}
