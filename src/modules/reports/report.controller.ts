import type { Request, Response } from 'express'
import * as reportService from './report.service'
import {
  attendanceReportQuerySchema,
  examResultsQuerySchema,
  studentStrengthQuerySchema,
  subjectPerformanceQuerySchema,
} from './report.schema'

export async function studentStrength(req: Request, res: Response) {
  const query = studentStrengthQuerySchema.parse(req.query)
  res.json(await reportService.studentStrength(query))
}

export async function attendance(req: Request, res: Response) {
  const query = attendanceReportQuerySchema.parse(req.query)
  res.json(await reportService.attendanceReport(query))
}

export async function departmentPerformance(_req: Request, res: Response) {
  res.json(await reportService.departmentPerformance())
}

export async function subjectPerformance(req: Request, res: Response) {
  const query = subjectPerformanceQuerySchema.parse(req.query)
  res.json(await reportService.subjectPerformance(query))
}

export async function examResults(req: Request, res: Response) {
  const query = examResultsQuerySchema.parse(req.query)
  res.json(await reportService.examResults(query))
}

export async function facultyWorkload(_req: Request, res: Response) {
  res.json(await reportService.facultyWorkload())
}
