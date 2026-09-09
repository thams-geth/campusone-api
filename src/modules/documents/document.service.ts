import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { DocumentInput, ListDocumentsQuery } from './document.schema'

async function assertOwnerExists(ownerType: DocumentInput['ownerType'], ownerId: string) {
  const owner =
    ownerType === 'STUDENT'
      ? await prisma.student.findUnique({ where: { id: ownerId } })
      : await prisma.faculty.findUnique({ where: { id: ownerId } })
  if (!owner) throw ApiError.badRequest(`${ownerType === 'STUDENT' ? 'Student' : 'Faculty member'} not found.`, { ownerId: ['Invalid owner'] })
}

export async function listDocuments(params: ListDocumentsQuery) {
  const { page, pageSize, ownerType, ownerId, type, status } = params
  const where = {
    ...(ownerType ? { ownerType } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.document.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.document.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

/** The caller's own documents — resolves their Student or Faculty profile rather than trusting a client-supplied owner id. */
export async function listMyDocuments(callerUserId: string) {
  const [student, faculty] = await Promise.all([
    prisma.student.findUnique({ where: { userId: callerUserId } }),
    prisma.faculty.findUnique({ where: { userId: callerUserId } }),
  ])
  const owner = student ? { ownerType: 'STUDENT' as const, ownerId: student.id } : faculty ? { ownerType: 'FACULTY' as const, ownerId: faculty.id } : null
  if (!owner) return []

  return prisma.document.findMany({ where: owner, orderBy: { createdAt: 'desc' } })
}

export async function getDocument(id: string) {
  const document = await prisma.document.findUnique({ where: { id } })
  if (!document) throw ApiError.notFound('Document not found')
  return document
}

export async function createDocument(tenantId: string, uploadedByUserId: string, input: DocumentInput) {
  await assertOwnerExists(input.ownerType, input.ownerId)
  const document = await prisma.document.create({ data: { tenantId, uploadedByUserId, ...input } })
  await logActivity(`added a ${document.type.toLowerCase()} document`, { entity: 'Document', entityId: document.id, action: 'CREATE' })
  return document
}

export async function updateDocument(id: string, input: DocumentInput) {
  const existing = await prisma.document.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Document not found')

  await assertOwnerExists(input.ownerType, input.ownerId)
  // A new file/version resets verification — an already-verified
  // document shouldn't stay "verified" against different content.
  const document = await prisma.document.update({
    where: { id },
    data: { ...input, version: { increment: 1 }, status: 'PENDING', verifiedByUserId: null },
  })
  await logActivity('updated a document', { entity: 'Document', entityId: id, action: 'UPDATE' })
  return document
}

export async function deleteDocument(id: string) {
  const existing = await prisma.document.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Document not found')

  await prisma.document.delete({ where: { id } })
  await logActivity('removed a document', { entity: 'Document', entityId: id, action: 'DELETE' })
}

export async function reviewDocument(id: string, verifiedByUserId: string, decision: 'VERIFIED' | 'REJECTED') {
  const existing = await prisma.document.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Document not found')
  if (existing.status !== 'PENDING') {
    throw ApiError.conflict('This document has already been reviewed.', 'ALREADY_REVIEWED')
  }

  const document = await prisma.document.update({ where: { id }, data: { status: decision, verifiedByUserId } })
  await logActivity(`${decision === 'VERIFIED' ? 'verified' : 'rejected'} a document`, {
    entity: 'Document',
    entityId: id,
    action: decision,
  })
  return document
}
