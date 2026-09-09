import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as assignmentService from './assignment.service'
import {
  assignmentInputSchema,
  evaluateSubmissionSchema,
  listAssignmentsQuerySchema,
  listSubmissionsQuerySchema,
  submitAssignmentSchema,
} from './assignment.schema'

export async function list(req: Request, res: Response) {
  const query = listAssignmentsQuerySchema.parse(req.query)
  res.json(await assignmentService.listAssignments(query))
}

export async function getById(req: Request, res: Response) {
  res.json(await assignmentService.getAssignment(requireParam(req, 'id')))
}

export async function create(req: Request, res: Response) {
  const input = assignmentInputSchema.parse(req.body)
  res.status(201).json(await assignmentService.createAssignment(req.auth!.tenantId, req.auth!.userId, input))
}

export async function update(req: Request, res: Response) {
  const input = assignmentInputSchema.parse(req.body)
  res.json(await assignmentService.updateAssignment(requireParam(req, 'id'), input))
}

export async function remove(req: Request, res: Response) {
  await assignmentService.deleteAssignment(requireParam(req, 'id'))
  res.status(204).end()
}

export async function publish(req: Request, res: Response) {
  res.json(await assignmentService.publishAssignment(requireParam(req, 'id')))
}

export async function close(req: Request, res: Response) {
  res.json(await assignmentService.closeAssignment(requireParam(req, 'id')))
}

export async function submit(req: Request, res: Response) {
  const input = submitAssignmentSchema.parse(req.body)
  res.status(201).json(await assignmentService.createSubmission(req.auth!.userId, requireParam(req, 'id'), input))
}

export async function listSubmissions(req: Request, res: Response) {
  const query = listSubmissionsQuerySchema.parse(req.query)
  res.json(await assignmentService.listSubmissions(requireParam(req, 'id'), query))
}

export async function evaluate(req: Request, res: Response) {
  const input = evaluateSubmissionSchema.parse(req.body)
  res.json(await assignmentService.evaluateSubmission(requireParam(req, 'submissionId'), req.auth!.userId, input))
}
