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
  STUDENT_IMPORT: 'Bulk-import students',
  STUDENT_EXPORT: 'Bulk-export students',

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

  ATTENDANCE_READ: 'View attendance',
  ATTENDANCE_MARK: 'Create attendance sessions and mark records',
  ATTENDANCE_EDIT: 'Edit attendance records before a session is locked',
  ATTENDANCE_APPROVE: 'Lock sessions and approve/reject correction requests',

  LEAVE_READ: 'View leave requests',
  LEAVE_REQUEST: 'Submit a leave request',
  LEAVE_APPROVE: 'Approve or reject leave requests',

  ASSIGNMENT_READ: 'View assignments',
  ASSIGNMENT_MANAGE: 'Create, edit, and publish assignments',
  ASSIGNMENT_SUBMIT: 'Submit an assignment',
  ASSIGNMENT_EVALUATE: 'Grade assignment submissions',

  EXAM_READ: 'View exams and exam schedules',
  EXAM_MANAGE: 'Create and edit exams and exam schedules',
  MARKS_READ: 'View marks',
  MARKS_ENTER: 'Enter marks',
  MARKS_EDIT: 'Edit marks before verification',
  MARKS_VERIFY: 'Verify submitted marks',
  MARKS_PUBLISH: 'Publish verified marks',
  MARKS_REVISE: 'Revise already-published marks (audited)',

  ANNOUNCEMENT_READ: 'View announcements',
  ANNOUNCEMENT_MANAGE: 'Create and edit announcements',

  DOCUMENT_READ: 'View documents',
  DOCUMENT_MANAGE: 'Create and edit document records',
  DOCUMENT_VERIFY: 'Verify or reject a document',

  REPORTS_READ: 'View reports',

  ADMISSION_READ: 'View admission applications',
  ADMISSION_CREATE: 'Create admission applications',
  ADMISSION_UPDATE: 'Edit admission applications',
  ADMISSION_DECIDE: 'Advance or reject an application through its lifecycle',
  ADMISSION_ENROLL: 'Enroll an accepted applicant as a student',

  FEE_READ: 'View fee structures and invoices',
  FEE_MANAGE: 'Create fee structures, invoices, and adjustments',
  PAYMENT_RECORD: 'Record a payment against an invoice',
  PAYMENT_REFUND: 'Record a refund against a payment',

  HOSTEL_READ: 'View hostels and rooms',
  HOSTEL_MANAGE: 'Create and edit hostels and rooms',
  HOSTEL_ALLOCATE: 'Allocate or vacate a student hostel room',

  TRANSPORT_READ: 'View vehicles and routes',
  TRANSPORT_MANAGE: 'Create and edit vehicles, routes, and stops',
  TRANSPORT_ALLOCATE: 'Allocate or remove a student transport route',

  LIBRARY_READ: 'View the book catalogue',
  LIBRARY_MANAGE: 'Create and edit books',
  LIBRARY_ISSUE: 'Issue or return a book',

  CERTIFICATE_READ: 'View certificate types and requests',
  CERTIFICATE_REQUEST: 'Request a certificate',
  CERTIFICATE_ISSUE: 'Issue or reject a certificate request',

  ACTIVITY_READ: 'View student activities',
  ACTIVITY_MANAGE: 'Record an activity for any student',
  ACTIVITY_SELF_REPORT: 'Record an activity for yourself',

  PLACEMENT_READ: 'View companies, job openings, and applications',
  PLACEMENT_MANAGE: 'Create companies, job openings, and manage applications',
  PLACEMENT_APPLY: 'Apply to a job opening',
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

// Release 2 — Academic Management. Grouped the same way as the
// structural block above: one "full manage" bundle for admin-tier
// roles, one "read + do my part" bundle for faculty/staff/students.
const ACADEMIC_MANAGEMENT_ADMIN: PermissionKey[] = [
  'ATTENDANCE_READ',
  'ATTENDANCE_MARK',
  'ATTENDANCE_EDIT',
  'ATTENDANCE_APPROVE',
  'LEAVE_READ',
  'LEAVE_APPROVE',
  'ASSIGNMENT_READ',
  'ASSIGNMENT_MANAGE',
  'ASSIGNMENT_EVALUATE',
  'EXAM_READ',
  'EXAM_MANAGE',
  'MARKS_READ',
  'MARKS_ENTER',
  'MARKS_EDIT',
  'MARKS_VERIFY',
  'MARKS_PUBLISH',
  'MARKS_REVISE',
  'ANNOUNCEMENT_READ',
  'ANNOUNCEMENT_MANAGE',
  'DOCUMENT_READ',
  'DOCUMENT_MANAGE',
  'DOCUMENT_VERIFY',
  'REPORTS_READ',
]

const ACADEMIC_MANAGEMENT_READ: PermissionKey[] = [
  'ATTENDANCE_READ',
  'LEAVE_READ',
  'ASSIGNMENT_READ',
  'EXAM_READ',
  'MARKS_READ',
  'ANNOUNCEMENT_READ',
  'DOCUMENT_READ',
]

// Release 3 — College Operations. Same admin/read split as Release 2.
// Admission decision authority (ADMISSION_DECIDE/_ENROLL) is deliberately
// left out of the STAFF bundle below — everything else here is routine
// front-desk/operations work (fee collection, hostel/transport
// allocation, issuing books/certificates), but admitting someone is a
// committee-level call, kept to DEPARTMENT_ADMIN/HOD/SUPER_ADMIN tier.
const COLLEGE_OPERATIONS_ADMIN: PermissionKey[] = [
  'ADMISSION_READ',
  'ADMISSION_CREATE',
  'ADMISSION_UPDATE',
  'ADMISSION_DECIDE',
  'ADMISSION_ENROLL',
  'FEE_READ',
  'FEE_MANAGE',
  'PAYMENT_RECORD',
  'PAYMENT_REFUND',
  'HOSTEL_READ',
  'HOSTEL_MANAGE',
  'HOSTEL_ALLOCATE',
  'TRANSPORT_READ',
  'TRANSPORT_MANAGE',
  'TRANSPORT_ALLOCATE',
  'LIBRARY_READ',
  'LIBRARY_MANAGE',
  'LIBRARY_ISSUE',
  'CERTIFICATE_READ',
  'CERTIFICATE_ISSUE',
  'ACTIVITY_READ',
  'ACTIVITY_MANAGE',
  'PLACEMENT_READ',
  'PLACEMENT_MANAGE',
]

const COLLEGE_OPERATIONS_STAFF: PermissionKey[] = [
  'ADMISSION_READ',
  'ADMISSION_CREATE',
  'FEE_READ',
  'PAYMENT_RECORD',
  'HOSTEL_READ',
  'HOSTEL_MANAGE',
  'HOSTEL_ALLOCATE',
  'TRANSPORT_READ',
  'TRANSPORT_MANAGE',
  'TRANSPORT_ALLOCATE',
  'LIBRARY_READ',
  'LIBRARY_MANAGE',
  'LIBRARY_ISSUE',
  'CERTIFICATE_READ',
  'CERTIFICATE_ISSUE',
  'ACTIVITY_READ',
  'PLACEMENT_READ',
]

const COLLEGE_OPERATIONS_READ: PermissionKey[] = [
  'FEE_READ',
  'HOSTEL_READ',
  'TRANSPORT_READ',
  'LIBRARY_READ',
  'CERTIFICATE_READ',
  'ACTIVITY_READ',
  'PLACEMENT_READ',
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
 * academic structure and academic-management workflows (matching today's
 * DEPARTMENT_ADMIN department/student access, extended to Release 2);
 * EXAM_ADMIN finally gets real grants here (exam/marks lifecycle) — it
 * was seeded with nothing in Milestone 1 because nothing existed yet for
 * it to manage. FACULTY/STAFF/STUDENT get the mix of read + "do my own
 * part" actions their role actually performs; PARENT still gets nothing
 * (Parent Portal not built).
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
    'STUDENT_IMPORT',
    'STUDENT_EXPORT',
    'DASHBOARD_READ',
    'INSTITUTION_READ',
    ...ADMIN_STRUCTURE,
    ...ACADEMIC_MANAGEMENT_ADMIN,
    ...COLLEGE_OPERATIONS_ADMIN,
  ],
  HOD: [
    'DEPARTMENT_READ',
    'STUDENT_READ',
    'STUDENT_CREATE',
    'STUDENT_UPDATE',
    'DASHBOARD_READ',
    'INSTITUTION_READ',
    ...ADMIN_STRUCTURE,
    ...ACADEMIC_MANAGEMENT_ADMIN,
    ...COLLEGE_OPERATIONS_ADMIN,
  ],
  EXAM_ADMIN: [
    'STUDENT_READ',
    'INSTITUTION_READ',
    'EXAM_READ',
    'EXAM_MANAGE',
    'MARKS_READ',
    'MARKS_VERIFY',
    'MARKS_PUBLISH',
    'MARKS_REVISE',
    'REPORTS_READ',
  ],
  FACULTY: [
    'STUDENT_READ',
    'DASHBOARD_READ',
    'INSTITUTION_READ',
    ...READ_ONLY_STRUCTURE,
    ...ACADEMIC_MANAGEMENT_READ,
    'ATTENDANCE_MARK',
    'ATTENDANCE_EDIT',
    'LEAVE_APPROVE',
    'ASSIGNMENT_MANAGE',
    'ASSIGNMENT_EVALUATE',
    'MARKS_ENTER',
    'ANNOUNCEMENT_MANAGE',
    'DOCUMENT_MANAGE',
    'DOCUMENT_VERIFY',
    ...COLLEGE_OPERATIONS_READ,
    'ACTIVITY_MANAGE',
  ],
  STAFF: [
    'STUDENT_READ',
    'DASHBOARD_READ',
    'INSTITUTION_READ',
    ...READ_ONLY_STRUCTURE,
    ...ACADEMIC_MANAGEMENT_READ,
    'DOCUMENT_MANAGE',
    ...COLLEGE_OPERATIONS_STAFF,
  ],
  STUDENT: [
    'INSTITUTION_READ',
    'ATTENDANCE_READ',
    'LEAVE_READ',
    'LEAVE_REQUEST',
    'ASSIGNMENT_READ',
    'ASSIGNMENT_SUBMIT',
    'MARKS_READ',
    'ANNOUNCEMENT_READ',
    'DOCUMENT_READ',
    ...COLLEGE_OPERATIONS_READ,
    'CERTIFICATE_REQUEST',
    'ACTIVITY_SELF_REPORT',
    'PLACEMENT_APPLY',
  ],
  PARENT: [],
}
