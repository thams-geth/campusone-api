import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as attendanceService from './attendance.service'
import {
  createSessionSchema,
  listCorrectionsQuerySchema,
  listRecordsQuerySchema,
  listSessionsQuerySchema,
  markRecordsSchema,
  requestCorrectionSchema,
} from './attendance.schema'

export async function listSessions(req: Request, res: Response) {
  const query = listSessionsQuerySchema.parse(req.query)
  res.json(await attendanceService.listSessions(query))
}

export async function getSession(req: Request, res: Response) {
  res.json(await attendanceService.getSession(requireParam(req, 'id')))
}

export async function createSession(req: Request, res: Response) {
  const input = createSessionSchema.parse(req.body)
  res.status(201).json(await attendanceService.createSession(req.auth!.tenantId, req.auth!.userId, input))
}

export async function markRecords(req: Request, res: Response) {
  const input = markRecordsSchema.parse(req.body)
  res.json(await attendanceService.markRecords(requireParam(req, 'id'), input))
}

export async function submitSession(req: Request, res: Response) {
  res.json(await attendanceService.submitSession(requireParam(req, 'id')))
}

export async function lockSession(req: Request, res: Response) {
  res.json(await attendanceService.lockSession(requireParam(req, 'id')))
}

export async function listByStudent(req: Request, res: Response) {
  const query = listRecordsQuerySchema.parse(req.query)
  res.json(await attendanceService.listRecordsByStudent(requireParam(req, 'studentId'), query))
}

export async function listBySection(req: Request, res: Response) {
  const query = listRecordsQuerySchema.parse(req.query)
  res.json(await attendanceService.listRecordsBySection(requireParam(req, 'sectionId'), query))
}

export async function listBySubject(req: Request, res: Response) {
  const query = listRecordsQuerySchema.parse(req.query)
  res.json(await attendanceService.listRecordsBySubject(requireParam(req, 'subjectId'), query))
}

export async function requestCorrection(req: Request, res: Response) {
  const input = requestCorrectionSchema.parse(req.body)
  res.status(201).json(
    await attendanceService.requestCorrection(req.auth!.tenantId, req.auth!.userId, requireParam(req, 'id'), input),
  )
}

export async function listCorrections(req: Request, res: Response) {
  const query = listCorrectionsQuerySchema.parse(req.query)
  res.json(await attendanceService.listCorrections(query))
}

export async function approveCorrection(req: Request, res: Response) {
  res.json(await attendanceService.reviewCorrection(requireParam(req, 'id'), req.auth!.userId, 'APPROVED'))
}

export async function rejectCorrection(req: Request, res: Response) {
  res.json(await attendanceService.reviewCorrection(requireParam(req, 'id'), req.auth!.userId, 'REJECTED'))
}
