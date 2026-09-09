import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { InstitutionUpdateInput } from './institution.schema'

// The Tenant *is* the institution (roadmap #2's `GET/PUT
// /institution`) — there's no separate settings table, just the fields
// on Tenant that aren't identity (slug stays read-only here).
export async function getInstitution(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) throw ApiError.notFound('Institution not found')
  return tenant
}

export async function updateInstitution(tenantId: string, input: InstitutionUpdateInput) {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { name: input.name, primaryColor: input.primaryColor || null },
  })
  await logActivity('updated institution settings', { entity: 'Tenant', entityId: tenantId, action: 'UPDATE' })
  return tenant
}
