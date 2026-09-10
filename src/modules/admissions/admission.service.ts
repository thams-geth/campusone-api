import type { AdmissionStatus } from '@prisma/client'
import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { triggerWebhooks } from '../webhooks/webhookDispatcher'
import { createStudent } from '../students/student.service'
import type {
  AdmissionApplicationInput,
  AdvanceApplicationInput,
  EnrollApplicationInput,
  ListAdmissionsQuery,
} from './admission.schema'

// The lifecycle in order, up to ACCEPTED — advancing only ever moves
// one step forward. ENROLLED is deliberately NOT reachable through
// this generic advance; only enrollApplication can set it, since
// that's the action that actually creates the Student row. REJECTED/
// WITHDRAWN are reachable from any non-terminal state via their own
// dedicated actions, not through this sequence.
const LIFECYCLE: AdmissionStatus[] = ['APPLIED', 'DOCUMENT_VERIFICATION', 'SHORTLISTED', 'APPROVED', 'OFFERED', 'ACCEPTED']
const TERMINAL_STATUSES: AdmissionStatus[] = ['ENROLLED', 'REJECTED', 'WITHDRAWN']

export async function listApplications(params: ListAdmissionsQuery) {
  const { page, pageSize, programId, status } = params
  const where = { ...(programId ? { programId } : {}), ...(status ? { status } : {}) }

  const [data, total] = await Promise.all([
    prisma.admissionApplication.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.admissionApplication.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getApplication(id: string) {
  const application = await prisma.admissionApplication.findUnique({ where: { id } })
  if (!application) throw ApiError.notFound('Admission application not found')
  return application
}

async function assertProgramExists(programId: string) {
  const program = await prisma.program.findUnique({ where: { id: programId } })
  if (!program) throw ApiError.badRequest('Program not found.', { programId: ['Invalid program'] })
  return program
}

export async function createApplication(tenantId: string, input: AdmissionApplicationInput) {
  await assertProgramExists(input.programId)

  const existing = await prisma.admissionApplication.findFirst({
    where: { email: { equals: input.email, mode: 'insensitive' }, programId: input.programId },
  })
  if (existing) {
    throw ApiError.conflict('An application from this email already exists for this program.', 'DUPLICATE_APPLICATION')
  }

  const application = await prisma.admissionApplication.create({ data: { tenantId, ...input } })
  await logActivity(`received an admission application from ${application.firstName} ${application.lastName}`, {
    entity: 'AdmissionApplication',
    entityId: application.id,
    action: 'CREATE',
  })
  return application
}

async function assertNotTerminal(id: string) {
  const application = await prisma.admissionApplication.findUnique({ where: { id } })
  if (!application) throw ApiError.notFound('Admission application not found')
  if (TERMINAL_STATUSES.includes(application.status)) {
    throw ApiError.conflict(`This application is already ${application.status.toLowerCase()}.`, 'APPLICATION_FINALIZED')
  }
  return application
}

export async function updateApplication(id: string, input: AdmissionApplicationInput) {
  await assertNotTerminal(id)
  await assertProgramExists(input.programId)

  const application = await prisma.admissionApplication.update({ where: { id }, data: input })
  await logActivity('updated an admission application', { entity: 'AdmissionApplication', entityId: id, action: 'UPDATE' })
  return application
}

export async function advanceApplication(id: string, reviewedByUserId: string, input: AdvanceApplicationInput) {
  const application = await assertNotTerminal(id)

  const currentIndex = LIFECYCLE.indexOf(application.status)
  const nextStatus = LIFECYCLE[currentIndex + 1]
  if (!nextStatus) {
    throw ApiError.conflict('This application is already at the final review stage — enroll it instead.', 'ALREADY_AT_FINAL_STAGE')
  }

  const updated = await prisma.admissionApplication.update({
    where: { id },
    data: { status: nextStatus, reviewedByUserId, reviewNotes: input.reviewNotes },
  })
  await logActivity(`advanced an admission application to ${nextStatus}`, {
    entity: 'AdmissionApplication',
    entityId: id,
    action: 'ADVANCE',
    before: { status: application.status },
    after: { status: nextStatus },
  })
  return updated
}

export async function rejectApplication(id: string, reviewedByUserId: string, input: AdvanceApplicationInput) {
  await assertNotTerminal(id)
  const updated = await prisma.admissionApplication.update({
    where: { id },
    data: { status: 'REJECTED', reviewedByUserId, reviewNotes: input.reviewNotes },
  })
  await logActivity('rejected an admission application', { entity: 'AdmissionApplication', entityId: id, action: 'REJECT' })
  return updated
}

export async function withdrawApplication(id: string) {
  await assertNotTerminal(id)
  const updated = await prisma.admissionApplication.update({ where: { id }, data: { status: 'WITHDRAWN' } })
  await logActivity('withdrew an admission application', { entity: 'AdmissionApplication', entityId: id, action: 'WITHDRAW' })
  return updated
}

/** Enrolling creates the real Student row through the same createStudent path a manual entry uses, and links back. */
export async function enrollApplication(tenantId: string, id: string, input: EnrollApplicationInput) {
  const application = await prisma.admissionApplication.findUnique({ where: { id }, include: { program: true } })
  if (!application) throw ApiError.notFound('Admission application not found')
  if (application.status !== 'ACCEPTED') {
    throw ApiError.conflict('Only an ACCEPTED application can be enrolled.', 'NOT_ACCEPTED')
  }

  const student = await createStudent(tenantId, {
    firstName: application.firstName,
    lastName: application.lastName,
    email: application.email,
    phone: application.phone,
    rollNumber: input.rollNumber,
    departmentId: application.program.departmentId,
    sectionId: input.sectionId,
    gender: input.gender,
    dateOfBirth: application.dateOfBirth,
    admissionDate: new Date(),
    status: 'ACTIVE',
  })

  await prisma.admissionApplication.update({ where: { id }, data: { status: 'ENROLLED' } })
  await prisma.student.update({ where: { id: student.id }, data: { admissionApplicationId: id } })

  await logActivity(`enrolled ${application.firstName} ${application.lastName} as a student`, {
    entity: 'AdmissionApplication',
    entityId: id,
    action: 'ENROLL',
  })
  await triggerWebhooks(tenantId, 'admission.enrolled', { applicationId: id, studentId: student.id })
  return { ...student, admissionApplicationId: id }
}
