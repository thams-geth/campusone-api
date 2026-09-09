import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { clearPermissionCache } from './permissionCache'
import { PERMISSIONS } from './permissions'
import type { AssignRoleInput } from './rbac.schema'

export async function listRoles(tenantId: string) {
  const roles = await prisma.role.findMany({
    where: { tenantId },
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: 'asc' },
  })

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    isSystem: role.isSystem,
    permissions: role.permissions.map((grant) => grant.permission.key),
  }))
}

export function listPermissions() {
  return Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description }))
}

/** Replaces a user's role assignment — every user holds exactly one role today (see the UserRole model's doc comment). */
export async function assignRole(tenantId: string, userId: string, input: AssignRoleInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.tenantId !== tenantId) throw ApiError.notFound('User not found')

  const role = await prisma.role.findFirst({ where: { tenantId, name: input.roleName } })
  if (!role) throw ApiError.badRequest(`Role "${input.roleName}" does not exist for this tenant.`, { roleName: ['Invalid role'] })

  await prisma.userRole.deleteMany({ where: { userId } })
  await prisma.userRole.create({ data: { tenantId, userId, roleId: role.id } })
  clearPermissionCache()

  await logActivity(`assigned the ${role.name} role to ${user.name}`, { entity: 'User', entityId: userId, action: 'ROLE_ASSIGN' })
  return { userId, role: role.name }
}
