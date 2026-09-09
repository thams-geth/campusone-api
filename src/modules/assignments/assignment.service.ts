import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { resolveOwnFacultyId } from '../shared/facultyContext'
import { resolveOwnStudentId } from '../shared/studentContext'
import type {
  AssignmentInput,
  EvaluateSubmissionInput,
  ListAssignmentsQuery,
  ListSubmissionsQuery,
  SubmitAssignmentInput,
} from './assignment.schema'

export async function listAssignments(params: ListAssignmentsQuery) {
  const { page, pageSize, sectionId, subjectId, status } = params
  const where = { ...(sectionId ? { sectionId } : {}), ...(subjectId ? { subjectId } : {}), ...(status ? { status } : {}) }

  const [data, total] = await Promise.all([
    prisma.assignment.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { dueDate: 'asc' } }),
    prisma.assignment.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getAssignment(id: string) {
  const assignment = await prisma.assignment.findUnique({ where: { id } })
  if (!assignment) throw ApiError.notFound('Assignment not found')
  return assignment
}

export async function createAssignment(tenantId: string, callerUserId: string, input: AssignmentInput) {
  const [subject, section, facultyId] = await Promise.all([
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
    prisma.section.findUnique({ where: { id: input.sectionId } }),
    resolveOwnFacultyId(callerUserId, input.facultyId),
  ])
  if (!subject) throw ApiError.badRequest('Subject not found.', { subjectId: ['Invalid subject'] })
  if (!section) throw ApiError.badRequest('Section not found.', { sectionId: ['Invalid section'] })

  const { facultyId: _ignored, ...rest } = input
  const assignment = await prisma.assignment.create({ data: { tenantId, ...rest, facultyId } })
  await logActivity(`created the assignment "${assignment.title}"`, { entity: 'Assignment', entityId: assignment.id, action: 'CREATE' })
  return assignment
}

async function assertEditable(id: string) {
  const assignment = await prisma.assignment.findUnique({ where: { id } })
  if (!assignment) throw ApiError.notFound('Assignment not found')
  if (assignment.status === 'CLOSED') {
    throw ApiError.conflict('A closed assignment cannot be edited.', 'ASSIGNMENT_CLOSED')
  }
  return assignment
}

export async function updateAssignment(id: string, input: AssignmentInput) {
  await assertEditable(id)
  const [subject, section] = await Promise.all([
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
    prisma.section.findUnique({ where: { id: input.sectionId } }),
  ])
  if (!subject) throw ApiError.badRequest('Subject not found.', { subjectId: ['Invalid subject'] })
  if (!section) throw ApiError.badRequest('Section not found.', { sectionId: ['Invalid section'] })

  const { facultyId: _ignored, ...rest } = input
  const assignment = await prisma.assignment.update({ where: { id }, data: rest })
  await logActivity(`updated the assignment "${assignment.title}"`, { entity: 'Assignment', entityId: id, action: 'UPDATE' })
  return assignment
}

export async function publishAssignment(id: string) {
  const assignment = await assertEditable(id)
  if (assignment.status !== 'DRAFT') throw ApiError.conflict('Only a DRAFT assignment can be published.', 'INVALID_ASSIGNMENT_STATUS')

  const updated = await prisma.assignment.update({ where: { id }, data: { status: 'PUBLISHED' } })
  await logActivity(`published the assignment "${assignment.title}"`, { entity: 'Assignment', entityId: id, action: 'PUBLISH' })
  return updated
}

export async function closeAssignment(id: string) {
  const assignment = await assertEditable(id)
  if (assignment.status !== 'PUBLISHED') throw ApiError.conflict('Only a PUBLISHED assignment can be closed.', 'INVALID_ASSIGNMENT_STATUS')

  const updated = await prisma.assignment.update({ where: { id }, data: { status: 'CLOSED' } })
  await logActivity(`closed the assignment "${assignment.title}"`, { entity: 'Assignment', entityId: id, action: 'CLOSE' })
  return updated
}

export async function deleteAssignment(id: string) {
  const existing = await prisma.assignment.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Assignment not found')

  const submissionCount = await prisma.assignmentSubmission.count({ where: { assignmentId: id } })
  if (submissionCount > 0) throw ApiError.conflict('Cannot delete an assignment that already has submissions.', 'ASSIGNMENT_IN_USE')

  await prisma.assignment.delete({ where: { id } })
  await logActivity(`removed the assignment "${existing.title}"`, { entity: 'Assignment', entityId: id, action: 'DELETE' })
}

export async function createSubmission(callerUserId: string, assignmentId: string, input: SubmitAssignmentInput) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } })
  if (!assignment) throw ApiError.notFound('Assignment not found')
  if (assignment.status !== 'PUBLISHED') {
    throw ApiError.conflict('This assignment is not open for submissions.', 'ASSIGNMENT_NOT_PUBLISHED')
  }

  const studentId = await resolveOwnStudentId(callerUserId, input.studentId)

  const existing = await prisma.assignmentSubmission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
  })
  if (existing) throw ApiError.conflict('You have already submitted this assignment.', 'ALREADY_SUBMITTED')

  const isLate = new Date() > assignment.dueDate
  const submission = await prisma.assignmentSubmission.create({
    data: {
      tenantId: assignment.tenantId,
      assignmentId,
      studentId,
      attachmentUrl: input.attachmentUrl,
      status: isLate ? 'LATE' : 'SUBMITTED',
    },
  })
  await logActivity('submitted an assignment', { entity: 'AssignmentSubmission', entityId: submission.id, action: 'CREATE' })
  return submission
}

export async function listSubmissions(assignmentId: string, params: ListSubmissionsQuery) {
  const { page, pageSize, status } = params
  const where = { assignmentId, ...(status ? { status } : {}) }

  const [data, total] = await Promise.all([
    prisma.assignmentSubmission.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { submittedAt: 'asc' } }),
    prisma.assignmentSubmission.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function evaluateSubmission(id: string, evaluatedByUserId: string, input: EvaluateSubmissionInput) {
  const submission = await prisma.assignmentSubmission.findUnique({ where: { id }, include: { assignment: true } })
  if (!submission) throw ApiError.notFound('Submission not found')
  if (input.marksObtained > submission.assignment.maxMarks) {
    throw ApiError.badRequest(`Marks cannot exceed the assignment's max marks (${submission.assignment.maxMarks}).`, {
      marksObtained: ['Too high'],
    })
  }

  const updated = await prisma.assignmentSubmission.update({
    where: { id },
    data: { status: 'EVALUATED', marksObtained: input.marksObtained, feedback: input.feedback, evaluatedByUserId },
  })
  await logActivity('evaluated an assignment submission', { entity: 'AssignmentSubmission', entityId: id, action: 'EVALUATE' })
  return updated
}
