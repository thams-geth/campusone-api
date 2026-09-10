import crypto from 'node:crypto'
import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { resolveOwnStudentId } from '../shared/studentContext'
import type {
  CertificateTypeInput,
  CreateCertificateRequestInput,
  ListCertificateRequestsQuery,
  RejectCertificateRequestInput,
} from './certificate.schema'

export async function listCertificateTypes() {
  return prisma.certificateType.findMany({ orderBy: { name: 'asc' } })
}

export async function createCertificateType(tenantId: string, input: CertificateTypeInput) {
  const existing = await prisma.certificateType.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } })
  if (existing) throw ApiError.conflict(`Certificate type "${input.name}" already exists.`, 'DUPLICATE_CERTIFICATE_TYPE')

  const type = await prisma.certificateType.create({ data: { tenantId, ...input } })
  await logActivity(`added the ${type.name} certificate type`, { entity: 'CertificateType', entityId: type.id, action: 'CREATE' })
  return type
}

export async function deleteCertificateType(id: string) {
  const existing = await prisma.certificateType.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Certificate type not found')

  const requestCount = await prisma.certificateRequest.count({ where: { certificateTypeId: id } })
  if (requestCount > 0) throw ApiError.conflict('Cannot delete a certificate type with requests against it.', 'CERTIFICATE_TYPE_IN_USE')

  await prisma.certificateType.delete({ where: { id } })
  await logActivity(`removed the ${existing.name} certificate type`, { entity: 'CertificateType', entityId: id, action: 'DELETE' })
}

export async function createRequest(tenantId: string, callerUserId: string, input: CreateCertificateRequestInput) {
  const studentId = await resolveOwnStudentId(callerUserId, input.studentId)

  const type = await prisma.certificateType.findUnique({ where: { id: input.certificateTypeId } })
  if (!type) throw ApiError.badRequest('Certificate type not found.', { certificateTypeId: ['Invalid certificate type'] })

  const request = await prisma.certificateRequest.create({
    data: { tenantId, studentId, certificateTypeId: input.certificateTypeId },
  })
  await logActivity(`requested a ${type.name} certificate`, { entity: 'CertificateRequest', entityId: request.id, action: 'CREATE' })
  return request
}

export async function listRequests(params: ListCertificateRequestsQuery) {
  const { page, pageSize, studentId, status } = params
  const where = { ...(studentId ? { studentId } : {}), ...(status ? { status } : {}) }

  const [data, total] = await Promise.all([
    prisma.certificateRequest.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.certificateRequest.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function listMyRequests(callerUserId: string) {
  const studentId = await resolveOwnStudentId(callerUserId, undefined)
  return prisma.certificateRequest.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } })
}

async function assertPending(id: string) {
  const request = await prisma.certificateRequest.findUnique({ where: { id } })
  if (!request) throw ApiError.notFound('Certificate request not found')
  if (request.status !== 'REQUESTED') {
    throw ApiError.conflict(`This request has already been ${request.status.toLowerCase()}.`, 'ALREADY_REVIEWED')
  }
  return request
}

/** verificationCode stands in for a digital signature/QR — see the schema comment. */
export async function issueRequest(id: string, issuedByUserId: string) {
  await assertPending(id)
  const verificationCode = crypto.randomBytes(16).toString('hex')

  const updated = await prisma.certificateRequest.update({
    where: { id },
    data: { status: 'ISSUED', issuedByUserId, issuedAt: new Date(), verificationCode },
  })
  await logActivity('issued a certificate', { entity: 'CertificateRequest', entityId: id, action: 'ISSUE' })
  return updated
}

export async function rejectRequest(id: string, input: RejectCertificateRequestInput) {
  await assertPending(id)
  const updated = await prisma.certificateRequest.update({
    where: { id },
    data: { status: 'REJECTED', rejectionReason: input.rejectionReason },
  })
  await logActivity('rejected a certificate request', { entity: 'CertificateRequest', entityId: id, action: 'REJECT' })
  return updated
}

export async function verifyCertificate(code: string) {
  const request = await prisma.certificateRequest.findFirst({
    where: { verificationCode: code, status: 'ISSUED' },
    include: { certificateType: true, student: { select: { firstName: true, lastName: true, rollNumber: true } } },
  })
  if (!request) {
    return { valid: false as const }
  }
  return {
    valid: true as const,
    certificateType: request.certificateType.name,
    studentName: `${request.student.firstName} ${request.student.lastName}`,
    rollNumber: request.student.rollNumber,
    issuedAt: request.issuedAt,
  }
}
