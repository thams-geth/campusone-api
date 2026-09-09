import { prisma } from '../../prisma/client'
import { getRequestContextOrThrow } from '../../prisma/tenantContext'

export interface AuditDetails {
  entity?: string
  entityId?: string
  action?: string
  // Optional before/after snapshot for sensitive changes — e.g. an
  // approved attendance correction or a marks revision after publish
  // (roadmap: "published/locked changes require authorization and an
  // audit record"). Keep these small; they're stored as-is in JSONB.
  before?: unknown
  after?: unknown
}

/**
 * Records an audit trail entry. `message` alone backs the dashboard's
 * recent-activity feed; `details` is optional structured metadata for
 * the fuller audit view (GET /api/v1/audit-logs — see src/modules/audit).
 */
export async function logActivity(message: string, details: AuditDetails = {}): Promise<void> {
  const ctx = getRequestContextOrThrow()
  const actor = await prisma.user.findUnique({ where: { id: ctx.userId } })

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorName: actor?.name ?? 'Unknown user',
      message,
      entity: details.entity,
      entityId: details.entityId,
      action: details.action,
      before: details.before as never,
      after: details.after as never,
      requestId: ctx.requestId,
    },
  })
}
