import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { timesOverlap } from './timeOverlap'
import type { PeriodSlotInput } from './periodSlot.schema'

/** The whole tenant-wide bell schedule, chronological — small and complete, not paginated. */
export async function listPeriodSlots() {
  return prisma.periodSlot.findMany({ orderBy: { startTime: 'asc' } })
}

export async function getPeriodSlot(id: string) {
  const slot = await prisma.periodSlot.findUnique({ where: { id } })
  if (!slot) throw ApiError.notFound('Period not found')
  return slot
}

async function assertNoOverlap(input: PeriodSlotInput, excludeId?: string) {
  const existing = await prisma.periodSlot.findMany({
    where: { ...(excludeId ? { id: { not: excludeId } } : {}) },
  })
  const conflict = existing.find((slot) => timesOverlap(slot.startTime, slot.endTime, input.startTime, input.endTime))
  if (conflict) {
    throw ApiError.conflict(`That time overlaps "${conflict.label}" (${conflict.startTime}–${conflict.endTime}).`, 'PERIOD_OVERLAP')
  }
}

export async function createPeriodSlot(tenantId: string, input: PeriodSlotInput) {
  await assertNoOverlap(input)
  const slot = await prisma.periodSlot.create({ data: { tenantId, ...input } })
  await logActivity('added a period to the timetable schedule', { entity: 'PeriodSlot', entityId: slot.id, action: 'CREATE' })
  return slot
}

export async function updatePeriodSlot(id: string, input: PeriodSlotInput) {
  const existing = await prisma.periodSlot.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Period not found')

  await assertNoOverlap(input, id)
  const slot = await prisma.periodSlot.update({ where: { id }, data: input })
  await logActivity('updated a period in the timetable schedule', { entity: 'PeriodSlot', entityId: slot.id, action: 'UPDATE' })
  return slot
}

export async function deletePeriodSlot(id: string) {
  const existing = await prisma.periodSlot.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Period not found')

  await prisma.periodSlot.delete({ where: { id } })
  await logActivity('removed a period from the timetable schedule', { entity: 'PeriodSlot', entityId: id, action: 'DELETE' })
}
