/**
 * The full permission catalogue (roadmap #23 — "do not hardcode all
 * permissions around roles"). This file is the single source of truth
 * for what a permission key means and which system roles get it by
 * default; src/modules/rbac/rbac.seed.ts writes this into the DB as
 * `Permission`/`Role`/`RolePermission` rows per tenant.
 *
 * Route guards never reference a role name directly — see
 * requirePermission in src/middleware/requireAuth.ts.
 */

export const PERMISSIONS = {
  DEPARTMENT_READ: 'View departments',
  DEPARTMENT_CREATE: 'Create departments',
  DEPARTMENT_UPDATE: 'Edit departments',
  DEPARTMENT_DELETE: 'Delete departments',

  STUDENT_READ: 'View students',
  STUDENT_CREATE: 'Create students',
  STUDENT_UPDATE: 'Edit students',
  STUDENT_DELETE: 'Delete students',

  DASHBOARD_READ: 'View the dashboard',

  ACADEMIC_YEAR_READ: 'View academic years',
  ACADEMIC_YEAR_CREATE: 'Create academic years',
  ACADEMIC_YEAR_UPDATE: 'Edit academic years',
  ACADEMIC_YEAR_DELETE: 'Delete academic years',

  PROGRAM_READ: 'View programs',
  PROGRAM_CREATE: 'Create programs',
  PROGRAM_UPDATE: 'Edit programs',
  PROGRAM_DELETE: 'Delete programs',

  BATCH_READ: 'View batches',
  BATCH_CREATE: 'Create batches',
  BATCH_UPDATE: 'Edit batches',
  BATCH_DELETE: 'Delete batches',

  SECTION_READ: 'View sections',
  SECTION_CREATE: 'Create sections',
  SECTION_UPDATE: 'Edit sections',
  SECTION_DELETE: 'Delete sections',

  SUBJECT_READ: 'View subjects',
  SUBJECT_CREATE: 'Create subjects',
  SUBJECT_UPDATE: 'Edit subjects',
  SUBJECT_DELETE: 'Delete subjects',

  FACULTY_READ: 'View faculty',
  FACULTY_CREATE: 'Create faculty',
  FACULTY_UPDATE: 'Edit faculty',
  FACULTY_DELETE: 'Delete faculty',

  ROOM_READ: 'View rooms',
  ROOM_CREATE: 'Create rooms',
  ROOM_UPDATE: 'Edit rooms',
  ROOM_DELETE: 'Delete rooms',

  TIMETABLE_READ: 'View timetable entries',
  TIMETABLE_CREATE: 'Create timetable entries',
  TIMETABLE_UPDATE: 'Edit timetable entries',
  TIMETABLE_DELETE: 'Delete timetable entries',

  INSTITUTION_READ: 'View institution settings',
  INSTITUTION_UPDATE: 'Edit institution settings',

  AUDIT_LOG_READ: 'View audit logs',

  ROLE_READ: 'View roles and permissions',
  ROLE_MANAGE: 'Assign roles to users',
} as const

export type PermissionKey = keyof typeof PERMISSIONS

const ADMIN_STRUCTURE: PermissionKey[] = [
  'ACADEMIC_YEAR_READ',
  'ACADEMIC_YEAR_CREATE',
  'ACADEMIC_YEAR_UPDATE',
  'ACADEMIC_YEAR_DELETE',
  'PROGRAM_READ',
  'PROGRAM_CREATE',
  'PROGRAM_UPDATE',
  'PROGRAM_DELETE',
  'BATCH_READ',
  'BATCH_CREATE',
  'BATCH_UPDATE',
  'BATCH_DELETE',
  'SECTION_READ',
  'SECTION_CREATE',
  'SECTION_UPDATE',
  'SECTION_DELETE',
  'SUBJECT_READ',
  'SUBJECT_CREATE',
  'SUBJECT_UPDATE',
  'SUBJECT_DELETE',
  'FACULTY_READ',
  'FACULTY_CREATE',
  'FACULTY_UPDATE',
  'FACULTY_DELETE',
  'ROOM_READ',
  'ROOM_CREATE',
  'ROOM_UPDATE',
  'ROOM_DELETE',
  'TIMETABLE_READ',
  'TIMETABLE_CREATE',
  'TIMETABLE_UPDATE',
  'TIMETABLE_DELETE',
]

const READ_ONLY_STRUCTURE: PermissionKey[] = [
  'ACADEMIC_YEAR_READ',
  'PROGRAM_READ',
  'BATCH_READ',
  'SECTION_READ',
  'SUBJECT_READ',
  'FACULTY_READ',
  'ROOM_READ',
  'TIMETABLE_READ',
]

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[]

/** The 10 system roles every tenant gets seeded with — see rbac.seed.ts. */
export const SYSTEM_ROLES = [
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
  'COLLEGE_ADMIN',
  'DEPARTMENT_ADMIN',
  'HOD',
  'EXAM_ADMIN',
  'FACULTY',
  'STAFF',
  'STUDENT',
  'PARENT',
] as const

export type SystemRoleName = (typeof SYSTEM_ROLES)[number]

/**
 * Default grants per system role. SUPER_ADMIN/COLLEGE_ADMIN/PLATFORM_ADMIN
 * get everything; DEPARTMENT_ADMIN and HOD get full read/write on the
 * academic structure (matching today's DEPARTMENT_ADMIN department/
 * student access, extended to the new hierarchy); FACULTY/STAFF/STUDENT
 * get read access matching today's broader-but-read-leaning access;
 * EXAM_ADMIN/PARENT are seeded with no grants yet — nothing they'd use
 * exists until Examination/Parent Portal are built.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRoleName, PermissionKey[]> = {
  PLATFORM_ADMIN: ALL_PERMISSIONS,
  SUPER_ADMIN: ALL_PERMISSIONS,
  COLLEGE_ADMIN: ALL_PERMISSIONS,
  DEPARTMENT_ADMIN: [
    'DEPARTMENT_READ',
    'DEPARTMENT_CREATE',
    'DEPARTMENT_UPDATE',
    'DEPARTMENT_DELETE',
    'STUDENT_READ',
    'STUDENT_CREATE',
    'STUDENT_UPDATE',
    'STUDENT_DELETE',
    'DASHBOARD_READ',
    'INSTITUTION_READ',
    ...ADMIN_STRUCTURE,
  ],
  HOD: [
    'DEPARTMENT_READ',
    'STUDENT_READ',
    'STUDENT_CREATE',
    'STUDENT_UPDATE',
    'DASHBOARD_READ',
    'INSTITUTION_READ',
    ...ADMIN_STRUCTURE,
  ],
  EXAM_ADMIN: [],
  FACULTY: ['STUDENT_READ', 'DASHBOARD_READ', 'INSTITUTION_READ', ...READ_ONLY_STRUCTURE],
  STAFF: ['STUDENT_READ', 'DASHBOARD_READ', 'INSTITUTION_READ', ...READ_ONLY_STRUCTURE],
  STUDENT: ['INSTITUTION_READ'],
  PARENT: [],
}
