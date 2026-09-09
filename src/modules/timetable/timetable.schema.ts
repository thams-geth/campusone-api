import { z } from 'zod'
import { Weekday } from '@prisma/client'

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use 24h HH:mm, e.g. "09:00"')

export const timetableEntryInputSchema = z
  .object({
    sectionId: z.string().min(1, 'Section is required'),
    subjectId: z.string().min(1, 'Subject is required'),
    facultyId: z.string().min(1, 'Faculty is required'),
    roomId: z.string().min(1, 'Room is required'),
    dayOfWeek: z.nativeEnum(Weekday),
    startTime: timeOfDay,
    endTime: timeOfDay,
  })
  .refine((data) => data.endTime > data.startTime, { message: 'End time must be after start time', path: ['endTime'] })

export type TimetableEntryInput = z.infer<typeof timetableEntryInputSchema>

export const listTimetableQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sectionId: z.string().trim().optional(),
  facultyId: z.string().trim().optional(),
  roomId: z.string().trim().optional(),
  dayOfWeek: z.nativeEnum(Weekday).optional(),
})

export type ListTimetableQuery = z.infer<typeof listTimetableQuerySchema>
