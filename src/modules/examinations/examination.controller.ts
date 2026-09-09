import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as examinationService from './examination.service'
import {
  editMarksSchema,
  enterMarksSchema,
  examInputSchema,
  examScheduleInputSchema,
  listExamsQuerySchema,
  reviseMarksSchema,
} from './examination.schema'

export async function listExams(req: Request, res: Response) {
  const query = listExamsQuerySchema.parse(req.query)
  res.json(await examinationService.listExams(query))
}

export async function getExam(req: Request, res: Response) {
  res.json(await examinationService.getExam(requireParam(req, 'id')))
}

export async function createExam(req: Request, res: Response) {
  const input = examInputSchema.parse(req.body)
  res.status(201).json(await examinationService.createExam(req.auth!.tenantId, input))
}

export async function updateExam(req: Request, res: Response) {
  const input = examInputSchema.parse(req.body)
  res.json(await examinationService.updateExam(requireParam(req, 'id'), input))
}

export async function removeExam(req: Request, res: Response) {
  await examinationService.deleteExam(requireParam(req, 'id'))
  res.status(204).end()
}

export async function listSchedules(req: Request, res: Response) {
  res.json(await examinationService.listSchedules(requireParam(req, 'id')))
}

export async function createSchedule(req: Request, res: Response) {
  const input = examScheduleInputSchema.parse(req.body)
  res.status(201).json(await examinationService.createSchedule(req.auth!.tenantId, requireParam(req, 'id'), input))
}

export async function updateSchedule(req: Request, res: Response) {
  const input = examScheduleInputSchema.parse(req.body)
  res.json(await examinationService.updateSchedule(requireParam(req, 'id'), input))
}

export async function removeSchedule(req: Request, res: Response) {
  await examinationService.deleteSchedule(requireParam(req, 'id'))
  res.status(204).end()
}

export async function enterMarks(req: Request, res: Response) {
  const input = enterMarksSchema.parse(req.body)
  res.json(await examinationService.enterMarks(req.auth!.tenantId, req.auth!.userId, requireParam(req, 'id'), input))
}

export async function listMarks(req: Request, res: Response) {
  res.json(await examinationService.listMarksForSchedule(requireParam(req, 'id')))
}

export async function submitMarks(req: Request, res: Response) {
  res.json(await examinationService.submitMarks(requireParam(req, 'id'), req.auth!.userId))
}

export async function verifyMarks(req: Request, res: Response) {
  res.json(await examinationService.verifyMarks(requireParam(req, 'id'), req.auth!.userId))
}

export async function publishMarks(req: Request, res: Response) {
  res.json(await examinationService.publishMarks(requireParam(req, 'id'), req.auth!.userId))
}

export async function editMarks(req: Request, res: Response) {
  const input = editMarksSchema.parse(req.body)
  res.json(await examinationService.editMarks(requireParam(req, 'id'), input))
}

export async function reviseMarks(req: Request, res: Response) {
  const input = reviseMarksSchema.parse(req.body)
  res.json(await examinationService.reviseMarks(requireParam(req, 'id'), input))
}

export async function getSemesterResult(req: Request, res: Response) {
  const semesterNumber = Number(requireParam(req, 'semesterNumber'))
  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined
  res.json(await examinationService.getSemesterResult(req.auth!.userId, studentId, semesterNumber))
}

export async function getCgpa(req: Request, res: Response) {
  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined
  res.json(await examinationService.getCgpa(req.auth!.userId, studentId))
}
