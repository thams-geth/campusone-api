import { z } from 'zod'
import { Gender, StudentStatus } from '@prisma/client'

const phoneRegex = /^\+?[0-9 ]{7,15}$/

export const studentInputSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  phone: z.string().trim().regex(phoneRegex, 'Enter a valid phone number'),
  rollNumber: z.string().trim().min(2, 'Roll number is required').max(20),
  departmentId: z.string().min(1, 'Department is required'),
  // Nullable/optional: the Program/Batch/Section hierarchy is new (see
  // the roadmap plan) and existing students predate it — a student can
  // still be created/managed department-only until assigned a section.
  sectionId: z.string().min(1).optional(),
  currentSemester: z.coerce.number().int().min(1).max(12).optional(),
  gender: z.nativeEnum(Gender),
  dateOfBirth: z.coerce.date(),
  admissionDate: z.coerce.date(),
  status: z.nativeEnum(StudentStatus),
  guardianName: z.string().trim().max(120).optional(),
  guardianPhone: z.string().trim().regex(phoneRegex, 'Enter a valid phone number').optional().or(z.literal('')),
  address: z.string().trim().max(300).optional(),
})

export type StudentInput = z.infer<typeof studentInputSchema>

export const listStudentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  departmentId: z.string().trim().optional(),
  status: z.nativeEnum(StudentStatus).optional(),
})

export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>
