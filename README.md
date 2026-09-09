# CampusOne API

Backend API for **CampusOne**, a multi-tenant SaaS college management platform. Paired with the [`campusone-admin`](../campusone-admin) frontend. See `CampusOne_Product_Ready_API_Roadmap.md` for the full target product and release plan this backend is building toward.

## Stack

- Express 5 + TypeScript
- Prisma + PostgreSQL
- JWT access + refresh token auth, with a dynamic Role/Permission RBAC engine (not hardcoded roles)
- Zod for request validation
- Redis (via Docker Compose) reserved for future background jobs (BullMQ) — not wired up yet, no job queue exists until a module actually needs one
- Vitest + Supertest for tests

## Getting started

```bash
cp .env.example .env        # then fill in real secrets
docker compose up -d        # Postgres + Redis (also creates the app_role — see Multi-tenancy below)
npm install
npm run prisma:migrate      # applies the schema + RLS policies
npm run prisma:seed         # seeds the permission catalogue + a demo tenant/admin (admin@demo-college.test / Passw0rd!)
npm run dev
```

The API listens on `http://localhost:4000` by default. `GET /health`, `/health/live`, `/health/ready` are unversioned liveness/readiness checks.

## API reference

Everything below reflects the current Zod schemas and Prisma models exactly — see `*.schema.ts` in each module for the source of truth if this drifts. All routes are mounted under `/api/v1`.

### Conventions

All routes except `/health*`, `POST /api/v1/auth/login`, and `POST /api/v1/auth/refresh` require `Authorization: Bearer <accessToken>`. Every route also requires the tenant to have the owning module enabled (`403` if not — see RBAC & modules below) and the caller's role to hold the specific permission the route declares. Request bodies are validated with Zod; a failing body never reaches business logic.

**Error response** (any non-2xx):

```json
{ "message": "Human-readable message", "code": "MACHINE_CODE", "details": { } }
```

`code` is one of the `ApiError` statics (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `TOO_MANY_REQUESTS`, `INTERNAL_ERROR`) or a domain-specific code raised by a service (e.g. `DUPLICATE_CODE`, `DEPARTMENT_IN_USE`, `FACULTY_CONFLICT` — see each module's section below for its own codes). A `422` with `code: "VALIDATION_ERROR"` means Zod rejected the body; `details` is Zod's `{ field: [messages] }` map. A `403` with a module name in the message means the tenant doesn't have that module enabled, not a permission problem.

**Paginated list envelope** (every list endpoint):

```json
{ "data": [ ], "meta": { "page": 1, "pageSize": 10, "total": 42, "totalPages": 5 } }
```

### RBAC & modules

- **Permissions, not hardcoded roles.** `Role`/`Permission`/`RolePermission`/`UserRole` are DB tables (`src/modules/rbac`) — every tenant is seeded with 10 system roles (`PLATFORM_ADMIN, SUPER_ADMIN, COLLEGE_ADMIN, DEPARTMENT_ADMIN, HOD, EXAM_ADMIN, FACULTY, STAFF, STUDENT, PARENT`) and default permission grants (`src/modules/rbac/permissions.ts`). Each route below is written as "requires permission `X`" — check that file for exactly which roles hold it today; that mapping can change without a route-code change.
  - **Gotcha:** seeding only happens at tenant creation (`seedTenantRoles`). If you extend the permission catalogue later, an *existing* tenant's roles don't automatically pick up the new grants — re-run `npm run prisma:seed` (idempotent — it re-syncs the demo tenant's grants via `skipDuplicates`) or call `seedTenantRoles(tenantId)` for any other existing tenant.
- **Modules.** Each route is also gated to a `ModuleId` — `CORE`, `ACADEMICS` (Attendance, Assignments, Leave, Timetable), `EXAMINATION` (Exams/Marks/Results), or `COMMUNICATION` (Announcements). `CORE` is always on; the others must be enabled per-tenant via a `TenantModule` row (no admin endpoint for this yet — see `enableModule` in `src/test/helpers.ts` for the shape, or set it directly).

### Auth endpoints (`/api/v1/auth`)

`login`/`refresh` sit behind a stricter rate limit than the rest of the API (20 req/15min, see `auth.routes.ts`).

| Route | Auth | Request body | Response |
|---|---|---|---|
| `POST /login` | none | `{ email, password }` | `200 { user: AuthUser, token }` + sets httpOnly `refreshToken` cookie |
| `POST /refresh` | refresh cookie | — | `200 { token }`, rotates the cookie |
| `POST /logout` | refresh cookie | — | `204` (no body), revokes + clears the cookie |
| `GET /me` | Bearer token | — | `200 { user: AuthUser }` |

```ts
AuthUser = { id, tenantId, name, email, role: string, isActive }
```

Errors: `401` on bad credentials, an inactive account, a locked account, or an expired/reused refresh token; `429` once the rate limit is hit.

### Departments (`/api/v1/departments`) — module `CORE`

Permissions: `DEPARTMENT_READ` / `_CREATE` / `_UPDATE` / `_DELETE`.

| Route | Request | Response |
|---|---|---|
| `GET /` | query: `page?, pageSize?, search?, status?` | `200` paginated `Department[]` |
| `GET /:id` | — | `200 Department` — 404s for another tenant's department (RLS) |
| `POST /` | body: `DepartmentInput` | `201 Department` |
| `PUT /:id` | body: `DepartmentInput` | `200 Department` |
| `DELETE /:id` | — | `204` — `409 DEPARTMENT_IN_USE` if it still has students |

```ts
DepartmentInput = { name: string, code: string /* 2–12, uppercased */, headOfDepartment?: string, description?: string, status: "ACTIVE"|"INACTIVE" }
Department = DepartmentInput & { id, tenantId, facultyCount: number, studentCount: number, createdAt, updatedAt }
```

`409 DUPLICATE_CODE` on a repeated code (case-insensitive, per tenant).

### Students (`/api/v1/students`) — module `CORE`

Permissions: `STUDENT_READ` / `_CREATE` / `_UPDATE` / `_DELETE`.

| Route | Request | Response |
|---|---|---|
| `GET /` | query: `page?, pageSize?, search?, departmentId?, status?` | `200` paginated `Student[]` |
| `GET /:id` | — | `200 Student` |
| `POST /` | body: `StudentInput` | `201 Student` |
| `PUT /:id` | body: `StudentInput` | `200 Student` |
| `DELETE /:id` | — | `204` |

```ts
StudentInput = {
  firstName, lastName: string, email: string, phone: string, rollNumber: string,
  departmentId: string, sectionId?: string, currentSemester?: number, // 1–12; both optional — pre-dates the academic hierarchy
  gender: "MALE"|"FEMALE"|"OTHER", dateOfBirth: string, admissionDate: string,
  status: "ACTIVE"|"INACTIVE"|"ALUMNI", guardianName?, guardianPhone?, address?: string,
}
Student = StudentInput & { id, tenantId, createdAt, updatedAt }
```

`422 INVALID_DEPARTMENT` / `DEPARTMENT_INACTIVE` / `INVALID_SECTION`; `409 DUPLICATE_EMAIL` / `DUPLICATE_ROLL_NUMBER`.

### Dashboard (`/api/v1/dashboard`) — module `CORE`

Permission: `DASHBOARD_READ`. Read-only.

| Route | Response |
|---|---|
| `GET /summary` | `{ totalStudents, activeStudents, totalDepartments, totalFaculty, pendingAdmissions }` |
| `GET /trend` | `[{ month, count }]` — enrollment by admission month |
| `GET /distribution` | `[{ departmentId, name, code, studentCount }]` — active departments only |
| `GET /activity` | `[{ id, message, actor, timestamp }]` — latest 10, newest first |

`pendingAdmissions` is a hardcoded placeholder (`7`) until an Admissions module exists.

### Academic Years (`/api/v1/academic-years`) — module `CORE`

Permissions: `ACADEMIC_YEAR_READ` / `_CREATE` / `_UPDATE` / `_DELETE`.

| Route | Request | Response |
|---|---|---|
| `GET /` | query: `page?, pageSize?, search?, status?` | `200` paginated `AcademicYear[]` |
| `GET /:id` | — | `200 AcademicYear` |
| `POST /` | body: `AcademicYearInput` | `201 AcademicYear` |
| `PUT /:id` | body: `AcademicYearInput` | `200 AcademicYear` |
| `DELETE /:id` | — | `204` — `409 ACADEMIC_YEAR_IN_USE` if it still has batches |

```ts
AcademicYearInput = { name: string /* ≤20 */, startDate: string, endDate: string /* > startDate */, isCurrent?: boolean, status?: "ACTIVE"|"CLOSED" }
```

Setting `isCurrent: true` clears it on every other academic year for the tenant. `409 DUPLICATE_ACADEMIC_YEAR` on a repeated name; `422` if `endDate <= startDate`.

### Programs (`/api/v1/programs`) — module `CORE`

Permissions: `PROGRAM_READ` / `_CREATE` / `_UPDATE` / `_DELETE`.

| Route | Request | Response |
|---|---|---|
| `GET /` | query: `page?, pageSize?, search?, departmentId?, status?` | `200` paginated `Program[]` |
| `POST /` | body: `ProgramInput` | `201 Program` |
| `PUT /:id` | body: `ProgramInput` | `200 Program` |
| `DELETE /:id` | — | `204` — `409 PROGRAM_IN_USE` if it still has batches or subjects |

```ts
ProgramInput = { departmentId: string, name: string, code: string /* 2–12, uppercased */, durationYears: number /* 1–10 */, status?: "ACTIVE"|"INACTIVE" }
```

`400` if `departmentId` doesn't exist; `409 DUPLICATE_CODE` on a repeated code.

### Batches (`/api/v1/batches`) — module `CORE`

Permissions: `BATCH_READ` / `_CREATE` / `_UPDATE` / `_DELETE`.

```ts
BatchInput = { programId: string, academicYearId: string, name: string /* ≤40 */, startYear: number, endYear: number /* > startYear */, status?: "ACTIVE"|"INACTIVE"|"GRADUATED" }
```

`400` on an invalid `programId`/`academicYearId`; `409 DUPLICATE_BATCH` on a repeated name within the program; `409 BATCH_IN_USE` on delete if it still has sections.

### Sections (`/api/v1/sections`) — module `CORE`

Permissions: `SECTION_READ` / `_CREATE` / `_UPDATE` / `_DELETE`.

```ts
SectionInput = { batchId: string, name: string /* ≤10 */, currentSemester: number /* 1–12 */, capacity?: number, status?: "ACTIVE"|"INACTIVE" }
```

`409 DUPLICATE_SECTION` on a repeated name within the batch; `409 SECTION_IN_USE` on delete if it still has students or timetable entries.

### Subjects (`/api/v1/subjects`) — module `CORE`

Permissions: `SUBJECT_READ` / `_CREATE` / `_UPDATE` / `_DELETE`.

```ts
SubjectInput = { programId: string, semesterNumber: number /* 1–12 */, code: string /* 2–12, uppercased */, name: string, credits: number /* 1–10 */, type?: "CORE"|"ELECTIVE"|"LAB"|"PROJECT"|"SEMINAR"|"PRACTICAL", facultyId?: string }
```

`409 DUPLICATE_CODE`; `409 SUBJECT_IN_USE` on delete if it still has timetable entries.

### Faculty (`/api/v1/faculty`) — module `CORE`

Permissions: `FACULTY_READ` / `_CREATE` / `_UPDATE` / `_DELETE`. A faculty member is both an employee profile and a login-capable account — creating one provisions the underlying `User` (role `FACULTY`) too.

```ts
// POST — provisions the login account
FacultyCreateInput = { name, email: string, password: string /* ≥8 */, employeeCode: string, departmentId: string, designation: string, qualification?: string, experienceYears?: number, joiningDate: string, status?: "ACTIVE"|"INACTIVE" }
// PUT — no email/password changes yet
FacultyUpdateInput = Omit<FacultyCreateInput, "email"|"password">
Faculty = FacultyUpdateInput & { id, tenantId, name, email, isActive, createdAt, updatedAt }
```

`409 DUPLICATE_EMAIL` / `DUPLICATE_EMPLOYEE_CODE`. `DELETE` deactivates the linked account (`isActive: false`) rather than deleting it, and `409 FACULTY_IN_USE` if timetable entries still reference them.

### Rooms (`/api/v1/rooms`) — module `CORE`

Permissions: `ROOM_READ` / `_CREATE` / `_UPDATE` / `_DELETE`. Deliberately flat — no building/floor hierarchy yet.

```ts
RoomInput = { name: string, code: string /* ≤20, uppercased */, capacity?: number, status?: "ACTIVE"|"INACTIVE" }
```

`409 DUPLICATE_CODE`; `409 ROOM_IN_USE` on delete if it still has timetable entries.

### Timetable (`/api/v1/timetable`) — module `ACADEMICS`

Permissions: `TIMETABLE_READ` / `_CREATE` / `_UPDATE` / `_DELETE`. The one Milestone-1 module gated to `ACADEMICS` instead of `CORE`.

| Route | Request | Response |
|---|---|---|
| `GET /` | query: `page?, pageSize?, sectionId?, facultyId?, roomId?, dayOfWeek?` | `200` paginated `TimetableEntry[]` |
| `POST /` | body: `TimetableEntryInput` | `201 TimetableEntry` |
| `PUT /:id` | body: `TimetableEntryInput` | `200 TimetableEntry` |
| `DELETE /:id` | — | `204` |

```ts
TimetableEntryInput = {
  sectionId, subjectId, facultyId, roomId: string,
  dayOfWeek: "MONDAY"|...|"SUNDAY",
  startTime: string, endTime: string, // "HH:mm" 24h, endTime > startTime
}
```

`400` on any invalid relation id. Conflict detection on create/update — `409 FACULTY_CONFLICT` / `ROOM_CONFLICT` / `SECTION_CONFLICT` if the same faculty/room/section already has an overlapping entry that day.

### Institution (`/api/v1/institution`) — module `CORE`

Permissions: `INSTITUTION_READ` / `INSTITUTION_UPDATE`. Singleton — always the caller's own tenant, no `:id`.

| Route | Request | Response |
|---|---|---|
| `GET /` | — | `200` the tenant record |
| `PUT /` | `{ name: string, primaryColor?: string }` (hex, e.g. `"#1677FF"`) | `200` the updated tenant record |

### RBAC admin (`/api/v1`) — module `CORE`

Permissions: `ROLE_READ` (GET routes), `ROLE_MANAGE` (assign).

| Route | Response |
|---|---|
| `GET /roles` | `200 [{ id, name, isSystem, permissions: string[] }]` — this tenant's 9 roles with their granted permission keys |
| `GET /permissions` | `200 [{ key, description }]` — the full permission catalogue |
| `POST /users/:id/role` | body `{ roleName: string }` → `200 { userId, role }` — replaces the user's role assignment (every user holds exactly one today) |

`400` if `roleName` isn't a role that exists for this tenant.

### Audit Logs (`/api/v1/audit-logs`) — module `CORE`

Permission: `AUDIT_LOG_READ` (admin-only by default grant).

| Route | Request | Response |
|---|---|---|
| `GET /` | query: `page?, pageSize?, entity?, entityId?, actorUserId?` | `200` paginated `AuditLog[]`, newest first |

Written automatically by every module's mutations (`src/modules/shared/activityLog.ts`) — `message` alone backs the dashboard's activity feed; `entity`/`entityId`/`action`/`requestId` back this fuller view.

### Attendance (`/api/v1/attendance`) — module `ACADEMICS`

Permissions: `ATTENDANCE_READ`, `ATTENDANCE_MARK` (create sessions, mark records, submit), `ATTENDANCE_EDIT` (edit before lock), `ATTENDANCE_APPROVE` (lock, approve/reject corrections). The roadmap's flagship "not just CRUD" example (§45): `DRAFT → SUBMITTED → LOCKED`, and once `LOCKED` a record can only change through a correction request + approval — never a direct edit.

| Route | Request | Response |
|---|---|---|
| `POST /sessions` | body: `{ sectionId, subjectId, date, facultyId? }` | `201 AttendanceSession` — pre-populates one `PRESENT` record per active student in the section; `facultyId` resolves to the caller's own Faculty profile if omitted |
| `GET /sessions` | query: `page?, pageSize?, sectionId?, subjectId?, facultyId?` | `200` paginated `AttendanceSession[]` |
| `GET /sessions/:id` | — | `200 AttendanceSession` with `records[]` |
| `PUT /sessions/:id/records` | body: `{ records: [{ studentId, status }] }` | `200 AttendanceSession` — `409 SESSION_LOCKED` once locked |
| `POST /sessions/:id/submit` | — | `200` — `DRAFT → SUBMITTED` only |
| `POST /sessions/:id/lock` | — | `200` — `SUBMITTED → LOCKED` only |
| `GET /student/:studentId`, `/section/:sectionId`, `/subject/:subjectId` | query: `page?, pageSize?, dateFrom?, dateTo?` | `200` paginated `AttendanceRecord[]` |
| `POST /records/:id/correction` | body: `{ requestedStatus, reason }` | `201 AttendanceCorrection` — only for a record in a `LOCKED` session |
| `GET /corrections` | query: `page?, pageSize?, status?` | `200` paginated `AttendanceCorrection[]` |
| `POST /corrections/:id/approve` \| `/reject` | — | `200` — approving updates the record and writes a before/after audit entry |

`status: PRESENT \| ABSENT \| LATE \| EXCUSED \| ON_LEAVE`. `409 DUPLICATE_SESSION` on a repeated section/subject/date.

### Leave (`/api/v1/leave`) — module `ACADEMICS`

Permissions: `LEAVE_READ`, `LEAVE_REQUEST` (self-service), `LEAVE_APPROVE` (also manages leave types). Integrated with Attendance per roadmap §16: approving a request sets any existing `AttendanceRecord` for that student in the date range to `ON_LEAVE`.

| Route | Request | Response |
|---|---|---|
| `GET /types` \| `POST /types` \| `PUT /types/:id` \| `DELETE /types/:id` | `{ name, defaultDaysPerYear }` | Standard CRUD — `409 LEAVE_TYPE_IN_USE` on delete if requests exist |
| `POST /requests` | `{ leaveTypeId, startDate, endDate, reason, studentId? }` | `201 LeaveRequest`, `PENDING` — `studentId` resolves to the caller's own Student profile if omitted |
| `GET /requests` | query: `page?, pageSize?, studentId?, status?` | `200` paginated `LeaveRequest[]` |
| `POST /requests/:id/approve` \| `/reject` | — | `200` — `409 ALREADY_REVIEWED` if not `PENDING` |
| `GET /balance/:studentId` | query: `year?` (defaults to current year) | `200 [{ leaveTypeId, leaveTypeName, defaultDaysPerYear, usedDays, remainingDays }]` — computed on read, not a stored ledger |

### Assignments (`/api/v1/assignments`) — module `ACADEMICS`

Permissions: `ASSIGNMENT_READ`, `ASSIGNMENT_MANAGE` (create/update/publish/close, faculty/admin), `ASSIGNMENT_SUBMIT` (self-service), `ASSIGNMENT_EVALUATE`. `DRAFT → PUBLISHED → CLOSED`; submissions only accepted while `PUBLISHED`.

| Route | Request | Response |
|---|---|---|
| `GET /` \| `GET /:id` | query: `page?, pageSize?, sectionId?, subjectId?, status?` | Standard list/get |
| `POST /` | `{ subjectId, sectionId, title, description?, startDate, dueDate, maxMarks, facultyId? }` | `201 Assignment`, `DRAFT` |
| `PUT /:id` | same body | `200` — `409 ASSIGNMENT_CLOSED` once closed |
| `POST /:id/publish` \| `/close` | — | `200` — state-machine guarded (`409 INVALID_ASSIGNMENT_STATUS`) |
| `DELETE /:id` | — | `204` — `409 ASSIGNMENT_IN_USE` if it has submissions |
| `POST /:id/submissions` | `{ attachmentUrl?, studentId? }` | `201 AssignmentSubmission` — `status: SUBMITTED` or `LATE` (past `dueDate`); `409 ALREADY_SUBMITTED` on a resubmit; `409 ASSIGNMENT_NOT_PUBLISHED` otherwise |
| `GET /:id/submissions` | query: `page?, pageSize?, status?` | `200` paginated `AssignmentSubmission[]` |
| `PUT /submissions/:submissionId/evaluate` | `{ marksObtained, feedback? }` | `200` — `400` if `marksObtained` exceeds the assignment's `maxMarks` |

`attachmentUrl` is a client-supplied reference (no file upload/object storage built here).

### Examinations (`/api/v1/examinations`) — module `EXAMINATION`

Permissions: `EXAM_READ`, `EXAM_MANAGE`, `MARKS_READ`, `MARKS_ENTER`, `MARKS_EDIT`, `MARKS_VERIFY`, `MARKS_PUBLISH`, `MARKS_REVISE` (revising a *published* mark — separate from `MARKS_EDIT`, always writes a before/after audit entry). Marks workflow: `DRAFT → SUBMITTED → VERIFIED → PUBLISHED`, transitioned in bulk per exam schedule.

| Route | Request | Response |
|---|---|---|
| `GET /exams` \| `POST /exams` \| `PUT /exams/:id` \| `DELETE /exams/:id` | `{ name, examType, academicYearId, semesterNumber, startDate, endDate }` | Standard CRUD — `409 EXAM_IN_USE` on delete if schedules exist |
| `GET /exams/:id/schedules` \| `POST /exams/:id/schedules` | `{ subjectId, examDate, startTime, endTime, roomId }` | `409 DUPLICATE_SCHEDULE` — one schedule per subject per exam |
| `PUT /schedules/:id` \| `DELETE /schedules/:id` | — | `409 SCHEDULE_IN_USE` on delete if marks exist |
| `POST /schedules/:id/marks` | `{ marks: [{ studentId, marksObtained?, maxMarks, specialStatus? }] }` | `200 Marks[]`, `DRAFT` — `409 MARKS_NOT_EDITABLE` if any entry has moved past `DRAFT` |
| `GET /schedules/:id/marks` | — | `200 Marks[]` (full roster) — **staff-tier only** (`MARKS_ENTER`/`_VERIFY`/`_PUBLISH`); students use `/results/*` instead |
| `POST /schedules/:id/marks/submit` \| `/verify` \| `/publish` | — | `200 Marks[]` — bulk state transition, `409 NO_MARKS_TO_TRANSITION` if none are in the expected prior state |
| `PUT /marks/:id` | `{ marksObtained?, specialStatus? }` | `200` — `409 MARKS_NOT_EDITABLE` once `VERIFIED`/`PUBLISHED` |
| `PUT /marks/:id/revise` | `{ marksObtained, reason }` | `200` — only for `PUBLISHED` marks; always audited |
| `GET /results/semester/:semesterNumber` | query: `studentId?` (defaults to caller's own) | `200 { studentId, semesterNumber, subjects: [{ subjectId, name, code, credits, percentage, grade, gradePoints }], sgpa }` |
| `GET /results/cgpa` | query: `studentId?` | `200 { studentId, subjectsCounted, totalCredits, cgpa }` |

Results are computed on read from `PUBLISHED` marks only (grade scale: `O`≥90, `A+`≥80, `A`≥70, `B+`≥60, `B`≥50, `C`≥40, else `F`; SGPA/CGPA are credit-weighted grade-point averages) — never stored, so they can't drift from the underlying marks.

### Announcements (`/api/v1/announcements`) — module `COMMUNICATION`

Permissions: `ANNOUNCEMENT_READ`, `ANNOUNCEMENT_MANAGE`. In-app only — no SMS/WhatsApp/email/push delivery yet.

| Route | Request | Response |
|---|---|---|
| `GET /` | query: `page?, pageSize?, audience?` | `200` paginated `Announcement[]` — unfiltered admin view |
| `GET /feed` | — | `200 Announcement[]` — the caller's personal feed: college-wide plus their own department/program/batch/section, currently published |
| `GET /:id` \| `POST /` \| `PUT /:id` \| `DELETE /:id` | `{ title, content, audience, priority?, publishAt?, expiryAt?, departmentId?/programId?/batchId?/sectionId? }` | Standard CRUD |

`audience: COLLEGE \| DEPARTMENT \| PROGRAM \| BATCH \| SECTION` — a `422` if the matching scope id (e.g. `departmentId` for `DEPARTMENT`) is missing.

### Documents (`/api/v1/documents`) — module `CORE`

Permissions: `DOCUMENT_READ`, `DOCUMENT_MANAGE`, `DOCUMENT_VERIFY`. Generic metadata only — `fileUrl` is a reference, no upload endpoint.

| Route | Request | Response |
|---|---|---|
| `GET /` | query: `page?, pageSize?, ownerType?, ownerId?, type?, status?` | `200` paginated `Document[]` — **staff-tier only** (`DOCUMENT_MANAGE`/`_VERIFY`) |
| `GET /mine` | — | `200 Document[]` — the caller's own (resolved via their Student/Faculty profile) |
| `POST /` | `{ ownerType, ownerId, type, fileUrl, expiryDate? }` | `201 Document`, `PENDING` |
| `PUT /:id` | same body | `200` — bumps `version`, resets to `PENDING` (a new file needs re-verification) |
| `POST /:id/verify` \| `/reject` | — | `200` — `409 ALREADY_REVIEWED` if not `PENDING` |

`ownerType: STUDENT \| FACULTY`; `type: BONAFIDE \| TRANSFER_CERTIFICATE \| CONDUCT_CERTIFICATE \| MARK_SHEET \| ID_PROOF \| OTHER`.

### Reports (`/api/v1/reports`) — module `CORE`

Permission: `REPORTS_READ`. Read-only aggregations over existing data — no new models. Reports needing unbuilt modules (Fees, Admissions, Placements) aren't here yet.

| Route | Query | Response |
|---|---|---|
| `GET /student-strength` | `departmentId?, programId?, batchId?, sectionId?` | `{ total, byDepartment: [{ departmentId, count }] }` |
| `GET /attendance` | `sectionId?, subjectId?, dateFrom?, dateTo?` | `{ totalSessions, totalRecords, presentCount, attendancePercentage }` |
| `GET /department-performance` | — | `[{ departmentId, name, studentCount, studentsAssessed, averageMarksPercentage }]` |
| `GET /subject-performance` | `programId?` | `[{ subjectId, name, code, studentsAssessed, averageMarksPercentage }]` |
| `GET /exam-results` | `examId` (required) | `{ examId, examName, totalAssessed, passCount, failCount, averagePercentage }` |
| `GET /faculty-workload` | — | `[{ facultyId, name, subjectsAssigned, weeklyPeriods }]` |

### Import / Export (`/api/v1/import-export`) — module `CORE`, Students only

Permissions: `STUDENT_IMPORT`, `STUDENT_EXPORT`. CSV, not Excel (no binary-parsing dependency added — see `src/utils/csv.ts`). Follows upload → validate → preview → confirm (roadmap §27) minus the Excel specifics; other entities (Faculty, Marks, Attendance) follow the same pattern later, not built yet.

| Route | Request | Response |
|---|---|---|
| `POST /students/preview` | `{ csv: string }` | `200 { totalRows, validCount, invalidCount, results: [{ row, valid, errors? }] }` — validates every row against the live `studentInputSchema`, creates nothing |
| `POST /students/commit` | `{ csv: string }` | `200 { createdCount, failedCount, failed: [{ row, errors }] }` — re-validates; an invalid row is skipped and reported, never partially inserted |
| `GET /students/export` | query: `departmentId?, status?` | `200` `text/csv` |

CSV columns: `firstName,lastName,email,phone,rollNumber,departmentId,gender,dateOfBirth,admissionDate,status,sectionId,currentSemester,guardianName,guardianPhone,address` (`departmentId`/`sectionId` are raw ids, not codes).

---

If Postgres was already running from before `docker/init-app-role.sql` existed, that init script won't retroactively run on the existing volume — apply it by hand once:

```bash
docker compose exec -T postgres psql -U campusone -d campusone < docker/init-app-role.sql
```

## Scripts

```bash
npm run dev             # dev server with auto-reload (tsx watch)
npm run build           # compile to dist/
npm run start           # run compiled build
npm run typecheck       # tsc, no emit
npm run lint            # eslint
npm run test            # vitest run
npm run prisma:generate # regenerate the Prisma client
npm run prisma:migrate  # create/apply a dev migration
npm run prisma:seed     # seed the permission catalogue + a demo tenant/admin
npm run prisma:studio   # browse the DB
```

## Project structure

```
src/
├── config/       # env validation, logger
├── middleware/   # error handling, auth, permission/module guards, request-id, tenant context
├── modules/      # one folder per feature — auth, rbac, departments, students, academic-years,
│                 # programs, batches, sections, subjects, faculty, rooms, timetable,
│                 # institution, audit, dashboard, attendance, leave, assignments,
│                 # examinations, announcements, documents, reports, import-export,
│                 # shared (audit-log writer + own-student/own-faculty resolvers)
├── prisma/       # Prisma client + extension, tenant context (AsyncLocalStorage)
├── utils/        # ApiError and other shared helpers
├── app.ts        # Express app wiring (middleware, /api/v1 routes)
└── server.ts     # process entry point
prisma/
├── schema.prisma
├── migrations/
└── seed.ts       # dev-only: permission catalogue + demo tenant/admin
docker/
└── init-app-role.sql  # creates the non-superuser role the API runs as
```

## Multi-tenancy

Pooled database, one schema, every table carries a `tenantId` column, enforced with Postgres Row-Level Security as the last line of defense — not just application-level `WHERE tenantId = ...` clauses. See `CLAUDE.md` for the full architecture rationale.

**Two Postgres roles, on purpose:** `campusone` (from `POSTGRES_USER`) is a Postgres *superuser* — that's how the official postgres image works — and Postgres superusers bypass Row-Level Security unconditionally, even with `FORCE ROW LEVEL SECURITY`. Migrations run as `campusone` (`DATABASE_URL`), but the running API connects as `campusone_app` (`APP_DATABASE_URL`), a plain non-superuser role created by `docker/init-app-role.sql`, which is what actually makes the RLS policies enforce anything. This isn't hypothetical — the first version of this setup used one role for everything, and `src/prisma/client.test.ts`'s RLS tests caught it immediately (every "isolation" test passed even with the policies doing nothing, because they ran as the superuser). If you ever see all-tenants-visible behavior, check which role the connection is using before anything else.

Tenant context flows: JWT → auth middleware sets `requestContext` (`AsyncLocalStorage`, `src/prisma/tenantContext.ts`) → the Prisma client extension (`src/prisma/client.ts`) reads it and runs `SET LOCAL app.current_tenant` in the same transaction as every query. One narrow, documented exception: login looks up a user by email before the tenant is known (email is globally unique so one login form can resolve it) — see `findUserByEmailForLogin` and the RLS policy comment on the `User` table. `Role`/`RolePermission` carry the same exception in reverse: they additionally allow `tenantId IS NULL` rows through, since the one cross-tenant `PLATFORM_ADMIN` role isn't owned by any tenant.

## Security notes

- Passwords are hashed with bcrypt (12 rounds); plaintext passwords never touch the database or logs (see the logger's redaction config).
- Access tokens are JWTs carrying a role *name* (not permissions — see RBAC & modules above); refresh tokens are opaque random values, stored as a SHA-256 hash (not the raw token), and delivered as an httpOnly cookie — never exposed to JS. Refresh tokens rotate on every use (the presented one is revoked and a new one issued); reusing an already-rotated token is rejected.
- Accounts lock for 30s after 5 consecutive failed logins (tracked server-side on the `User` row, not just client-side UX).
- All request bodies are validated with Zod before touching business logic; validation failures never reach the database layer.
- Every request carries an `X-Request-ID` (caller-supplied or generated), echoed back on the response and attached to structured logs and audit log entries (`src/middleware/requestId.ts`).
- CORS is locked to the configured frontend origin(s); `credentials: true` is required for the refresh-token cookie to work cross-origin in dev.
- Rate limiting is applied globally, with a stricter limit on auth endpoints (login/refresh) to slow down credential-stuffing attempts. This is defense-in-depth, not a substitute for a proper WAF/edge rate limiter in production.
- `npm audit`: as of this writing, `prisma`'s CLI has unresolved advisories in its bundled MySQL driver and config-merging dependency (mysql2, deepmerge-ts) — these affect Prisma's dev-time CLI tooling, not the `@prisma/client` runtime library actually used by the running API, and we only use the Postgres driver. Re-check on each dependency bump.
