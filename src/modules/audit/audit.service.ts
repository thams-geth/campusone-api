import { prisma } from '../../prisma/client'
import type { ListAuditLogsQuery } from './audit.schema'

export async function listAuditLogs(params: ListAuditLogsQuery) {
  const { page, pageSize, entity, entityId, actorUserId } = params

  const where = {
    ...(entity ? { entity } : {}),
    ...(entityId ? { entityId } : {}),
    ...(actorUserId ? { actorUserId } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}
