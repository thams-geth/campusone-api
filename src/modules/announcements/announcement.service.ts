import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { dispatchNotification, resolveAudienceUserIds } from '../notifications/notification.service'
import type { AnnouncementInput, ListAnnouncementsQuery } from './announcement.schema'

export async function listAnnouncements(params: ListAnnouncementsQuery) {
  const { page, pageSize, audience } = params
  const where = { ...(audience ? { audience } : {}) }

  const [data, total] = await Promise.all([
    prisma.announcement.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { publishAt: 'desc' } }),
    prisma.announcement.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getAnnouncement(id: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id } })
  if (!announcement) throw ApiError.notFound('Announcement not found')
  return announcement
}

async function assertScopeExists(input: AnnouncementInput) {
  if (input.departmentId && !(await prisma.department.findUnique({ where: { id: input.departmentId } }))) {
    throw ApiError.badRequest('Department not found.', { departmentId: ['Invalid department'] })
  }
  if (input.programId && !(await prisma.program.findUnique({ where: { id: input.programId } }))) {
    throw ApiError.badRequest('Program not found.', { programId: ['Invalid program'] })
  }
  if (input.batchId && !(await prisma.batch.findUnique({ where: { id: input.batchId } }))) {
    throw ApiError.badRequest('Batch not found.', { batchId: ['Invalid batch'] })
  }
  if (input.sectionId && !(await prisma.section.findUnique({ where: { id: input.sectionId } }))) {
    throw ApiError.badRequest('Section not found.', { sectionId: ['Invalid section'] })
  }
}

export async function createAnnouncement(tenantId: string, authorUserId: string, input: AnnouncementInput) {
  await assertScopeExists(input)
  const announcement = await prisma.announcement.create({ data: { tenantId, authorUserId, ...input } })
  await logActivity(`posted the "${announcement.title}" announcement`, {
    entity: 'Announcement',
    entityId: announcement.id,
    action: 'CREATE',
  })

  // Only notify for announcements that are live now — a future-dated
  // publishAt has no separate "it just went live" job to catch it
  // later, same scope boundary as the reminder job only scanning what
  // already exists (not a full scheduler).
  if (announcement.publishAt <= new Date()) {
    const recipients = (await resolveAudienceUserIds(announcement)).filter((id) => id !== authorUserId)
    await dispatchNotification({
      tenantId,
      userIds: recipients,
      type: 'ANNOUNCEMENT_PUBLISHED',
      title: announcement.title,
      body: announcement.content.length > 200 ? `${announcement.content.slice(0, 197)}...` : announcement.content,
      entity: 'Announcement',
      entityId: announcement.id,
    })
  }

  return announcement
}

export async function updateAnnouncement(id: string, input: AnnouncementInput) {
  const existing = await prisma.announcement.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Announcement not found')

  await assertScopeExists(input)
  const announcement = await prisma.announcement.update({ where: { id }, data: input })
  await logActivity(`updated the "${announcement.title}" announcement`, {
    entity: 'Announcement',
    entityId: id,
    action: 'UPDATE',
  })
  return announcement
}

export async function deleteAnnouncement(id: string) {
  const existing = await prisma.announcement.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Announcement not found')

  await prisma.announcement.delete({ where: { id } })
  await logActivity(`removed the "${existing.title}" announcement`, { entity: 'Announcement', entityId: id, action: 'DELETE' })
}

/** The caller's personal feed — COLLEGE-wide plus whatever department/program/batch/section they belong to, currently published. */
export async function getFeed(callerUserId: string) {
  const [student, faculty] = await Promise.all([
    prisma.student.findUnique({ where: { userId: callerUserId }, include: { section: { include: { batch: true } } } }),
    prisma.faculty.findUnique({ where: { userId: callerUserId } }),
  ])

  const departmentId = student?.departmentId ?? faculty?.departmentId
  const programId = student?.section?.batch.programId
  const batchId = student?.section?.batchId
  const sectionId = student?.sectionId

  const now = new Date()
  return prisma.announcement.findMany({
    where: {
      publishAt: { lte: now },
      OR: [{ expiryAt: null }, { expiryAt: { gt: now } }],
      AND: [
        {
          OR: [
            { audience: 'COLLEGE' },
            ...(departmentId ? [{ audience: 'DEPARTMENT' as const, departmentId }] : []),
            ...(programId ? [{ audience: 'PROGRAM' as const, programId }] : []),
            ...(batchId ? [{ audience: 'BATCH' as const, batchId }] : []),
            ...(sectionId ? [{ audience: 'SECTION' as const, sectionId }] : []),
          ],
        },
      ],
    },
    orderBy: { publishAt: 'desc' },
  })
}
