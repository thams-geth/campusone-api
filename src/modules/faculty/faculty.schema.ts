import { z } from 'zod'
import { FacultyStatus } from '@prisma/client'

const facultyCoreShape = {
  employeeCode: z
    .string()
    .trim()
    .min(2, 'Employee code must be at least 2 characters')
    .max(20)
    .transform((value) => value.toUpperCase()),
  departmentId: z.string().min(1, 'Department is required'),
  designation: z.string().trim().min(2, 'Designation is required').max(80),
  qualification: z.string().trim().max(120).optional(),
  experienceYears: z.coerce.number().int().min(0).max(60).default(0),
  joiningDate: z.coerce.date(),
  status: z.nativeEnum(FacultyStatus).default('ACTIVE'),
}

// Faculty is both an employee profile and a login-capable account — see
// faculty.service.ts. Creating one provisions the underlying User too,
// so the admin sets an initial password here; there's no invite/reset
// flow yet (Communication module, deferred — see the roadmap plan).
export const facultyCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  ...facultyCoreShape,
})
export type FacultyCreateInput = z.infer<typeof facultyCreateSchema>

// Email/password changes aren't supported through this endpoint yet.
export const facultyUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  ...facultyCoreShape,
})
export type FacultyUpdateInput = z.infer<typeof facultyUpdateSchema>

export const listFacultyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  departmentId: z.string().trim().optional(),
  status: z.nativeEnum(FacultyStatus).optional(),
})
export type ListFacultyQuery = z.infer<typeof listFacultyQuerySchema>
