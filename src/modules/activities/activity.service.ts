import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { resolveOwnStudentId } from '../shared/studentContext'
import type { ActivityInput, ListActivitiesQuery } from './activity.schema'

export async function listActivities(params: ListActivitiesQuery) {
  const { page, pageSize, studentId, type } = params
  const where = { ...(studentId ? { studentId } : {}), ...(type ? { type } : {}) }

  const [data, total] = await Promise.all([
    prisma.studentActivity.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { date: 'desc' } }),
    prisma.studentActivity.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function listMyActivities(callerUserId: string) {
  const studentId = await resolveOwnStudentId(callerUserId, undefined)
  return prisma.studentActivity.findMany({ where: { studentId }, orderBy: { date: 'desc' } })
}

export async function getActivity(id: string) {
  const activity = await prisma.studentActivity.findUnique({ where: { id } })
  if (!activity) throw ApiError.notFound('Activity not found')
  return activity
}

export async function createActivity(tenantId: string, callerUserId: string, input: ActivityInput) {
  const studentId = await resolveOwnStudentId(callerUserId, input.studentId)
  const { studentId: _ignored, ...rest } = input

  const activity = await prisma.studentActivity.create({ data: { tenantId, studentId, ...rest } })
  await logActivity(`recorded a student activity: ${activity.title}`, { entity: 'StudentActivity', entityId: activity.id, action: 'CREATE' })
  return activity
}

export async function updateActivity(id: string, input: ActivityInput) {
  const existing = await prisma.studentActivity.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Activity not found')

  const { studentId: _ignored, ...rest } = input
  const activity = await prisma.studentActivity.update({ where: { id }, data: rest })
  await logActivity(`updated a student activity: ${activity.title}`, { entity: 'StudentActivity', entityId: id, action: 'UPDATE' })
  return activity
}

export async function deleteActivity(id: string) {
  const existing = await prisma.studentActivity.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Activity not found')

  await prisma.studentActivity.delete({ where: { id } })
  await logActivity(`removed a student activity: ${existing.title}`, { entity: 'StudentActivity', entityId: id, action: 'DELETE' })
}
