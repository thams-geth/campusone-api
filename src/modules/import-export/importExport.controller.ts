import type { Request, Response } from 'express'
import * as importExportService from './importExport.service'
import { exportStudentsQuerySchema, importCsvSchema } from './importExport.schema'

export async function previewStudentImport(req: Request, res: Response) {
  const input = importCsvSchema.parse(req.body)
  res.json(importExportService.previewStudentImport(input.csv))
}

export async function commitStudentImport(req: Request, res: Response) {
  const input = importCsvSchema.parse(req.body)
  res.json(await importExportService.commitStudentImport(req.auth!.tenantId, input.csv))
}

export async function exportStudents(req: Request, res: Response) {
  const query = exportStudentsQuerySchema.parse(req.query)
  const csv = await importExportService.exportStudentsCsv(query)
  res.type('text/csv').send(csv)
}
