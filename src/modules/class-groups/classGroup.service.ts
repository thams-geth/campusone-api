import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { getPermissionsForRole } from '../rbac/permissionCache'
import { dispatchNotification } from '../notifications/notification.service'
import type { ListClassGroupMessagesQuery, PostClassGroupMessageInput } from './classGroup.schema'

/** No separate ClassGroup entity — a Section already IS the class, so its group is just messages scoped by sectionId. */
async function assertSectionExists(sectionId: string) {
  const section = await prisma.section.findUnique({ where: { id: sectionId } })
  if (!section) throw ApiError.notFound('Section not found')
  return section
}

async function canManageAnySection(tenantId: string, role: string): Promise<boolean> {
  const permissions = await getPermissionsForRole(tenantId, role)
  return permissions.has('CLASS_GROUP_MANAGE')
}

/** A student in the section, or a faculty member who teaches it (derived from Timetable, not a stored membership list). */
async function assertSectionMember(userId: string, sectionId: string): Promise<void> {
  const [student, facultyEntry] = await Promise.all([
    prisma.student.findFirst({ where: { userId, sectionId } }),
    prisma.timetableEntry.findFirst({ where: { sectionId, faculty: { userId } } }),
  ])
  if (!student && !facultyEntry) {
    throw ApiError.forbidden('You are not a member of this class group.')
  }
}

async function assertAccess(tenantId: string, userId: string, role: string, sectionId: string): Promise<void> {
  if (await canManageAnySection(tenantId, role)) return
  await assertSectionMember(userId, sectionId)
}

/** Everyone who should be notified about a new message — active students in the section plus any faculty who teach it. */
export async function resolveClassGroupRecipients(sectionId: string): Promise<string[]> {
  const [students, timetableEntries] = await Promise.all([
    prisma.student.findMany({ where: { sectionId, status: 'ACTIVE', userId: { not: null } }, select: { userId: true } }),
    prisma.timetableEntry.findMany({ where: { sectionId }, select: { faculty: { select: { userId: true } } }, distinct: ['facultyId'] }),
  ])
  return Array.from(new Set([...students.map((s) => s.userId!), ...timetableEntries.map((entry) => entry.faculty.userId)]))
}

export async function listMessages(
  tenantId: string,
  userId: string,
  role: string,
  sectionId: string,
  params: ListClassGroupMessagesQuery,
) {
  await assertSectionExists(sectionId)
  await assertAccess(tenantId, userId, role, sectionId)

  const { page, pageSize } = params
  const where = { sectionId }
  const [data, total] = await Promise.all([
    prisma.classGroupMessage.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { id: true, name: true } } },
    }),
    prisma.classGroupMessage.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function postMessage(
  tenantId: string,
  userId: string,
  role: string,
  sectionId: string,
  input: PostClassGroupMessageInput,
) {
  const section = await assertSectionExists(sectionId)
  await assertAccess(tenantId, userId, role, sectionId)

  const message = await prisma.classGroupMessage.create({
    data: { tenantId, sectionId, authorUserId: userId, body: input.body },
    include: { author: { select: { id: true, name: true } } },
  })

  const recipients = (await resolveClassGroupRecipients(sectionId)).filter((id) => id !== userId)
  await dispatchNotification({
    tenantId,
    userIds: recipients,
    type: 'CLASS_GROUP_MESSAGE',
    title: `New message in ${section.name}`,
    body: input.body.length > 200 ? `${input.body.slice(0, 197)}...` : input.body,
    entity: 'ClassGroupMessage',
    entityId: message.id,
  })

  return message
}
