import { z } from 'zod'
import { PeriodType } from '@prisma/client'

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use 24h HH:mm, e.g. "09:00"')

export const periodSlotInputSchema = z
  .object({
    label: z.string().trim().min(1, 'Label is required').max(60),
    type: z.nativeEnum(PeriodType),
    startTime: timeOfDay,
    endTime: timeOfDay,
  })
  .refine((data) => data.endTime > data.startTime, { message: 'End time must be after start time', path: ['endTime'] })

export type PeriodSlotInput = z.infer<typeof periodSlotInputSchema>
