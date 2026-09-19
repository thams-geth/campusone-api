import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import { listStudentsQuerySchema, studentInputSchema } from './student.schema'
import * as studentService from './student.service'

export async function list(req: Request, res: Response) {
  const query = listStudentsQuerySchema.parse(req.query)
  res.json(await studentService.listStudents(query))
}

export async function getById(req: Request, res: Response) {
  res.json(await studentService.getStudent(requireParam(req, 'id')))
}

export async function get360(req: Request, res: Response) {
  res.json(await studentService.getStudent360(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = studentInputSchema.parse(req.body)
  res.status(201).json(await studentService.createStudent(req.auth!.tenantId, input))
}

export async function update(req: Request, res: Response) {
  const input = studentInputSchema.parse(req.body)
  res.json(await studentService.updateStudent(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await studentService.deleteStudent(requireParam(req, 'id'))
  res.status(204).end()
}
