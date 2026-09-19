# CampusOne API

Backend API for **CampusOne**, a multi-tenant SaaS college management platform. Paired with the [`campusone-admin`](../campusone-admin) frontend. See `CampusOne_Product_Ready_API_Roadmap.md` for the full target product and release plan this backend is building toward.

## Stack

- Express 5 + TypeScript
- Prisma + PostgreSQL
- JWT access + refresh token auth, with a dynamic Role/Permission RBAC engine (not hardcoded roles)
- Zod for request validation
- Redis (via Docker Compose) + BullMQ for the one background job that exists: the notification reminder scan (`src/queue`) — everything else is still synchronous, no queue added speculatively
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

**Interactive API docs (Swagger UI):** `http://localhost:4000/api/docs` — every route below, live and "Try it out"-able (raw spec at `/api/docs.json`, source at `docs/openapi.yaml`). Log in via `POST /auth/login` first, click **Authorize**, and paste the `token` in as a Bearer token to try authenticated routes.

**Architecture &amp; flow diagrams:** [`docs/handbook.html`](docs/handbook.html) — how a request finds its tenant, the auth/MFA sequence, and the core domain flows (admissions → enrollment, attendance lock/correction, the fees ledger, notification fan-out, webhook delivery) as diagrams. Open it directly in a browser (needs internet access once, to load fonts + the Mermaid renderer from a CDN — `npx serve docs` also works if a bare double-click doesn't load them).

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
- **Modules.** Each route is also gated to a `ModuleId` — `CORE`, `ACADEMICS` (Attendance, Assignments, Leave, Timetable), `EXAMINATION` (Exams/Marks/Results), `COMMUNICATION` (Announcements), `ADMISSIONS`, `FINANCE` (Fees), `HOSTEL_TRANSPORT` (Hostel + Transport), `LIBRARY`, or `PLACEMENT_ALUMNI` (Placements). `CORE` is always on; the others must be enabled per-tenant via a `TenantModule` row (no admin endpoint for this yet — see `enableModule` in `src/test/helpers.ts` for the shape, or set it directly). Release 4 (Billing, API Keys, Webhooks, Integrations, Approvals) is all `CORE`-gated — no new `ModuleId`s. `HR_PAYROLL`, `COMPLIANCE_REPORTING`, and `INVENTORY_PROCUREMENT` remain unused, reserved for future work beyond the current roadmap.

### Auth endpoints (`/api/v1/auth`)

`login`/`refresh` sit behind a stricter rate limit than the rest of the API (20 req/15min, see `auth.routes.ts`).

| Route | Auth | Request body | Response |
|---|---|---|---|
| `POST /login` | none | `{ email, password, mfaCode? }` | `200 { user: AuthUser, token }` + sets httpOnly `refreshToken` cookie |
| `POST /refresh` | refresh cookie | — | `200 { token }`, rotates the cookie |
| `POST /logout` | refresh cookie | — | `204` (no body), revokes + clears the cookie |
| `GET /me` | Bearer token | — | `200 { user: AuthUser }` |
| `POST /change-password` | Bearer token | `{ currentPassword, newPassword }` | `204` |
| `POST /forgot-password` | none | `{ email }` | `200 { message, resetToken? }` |
| `POST /reset-password` | none | `{ token, newPassword }` | `204` |

```ts
AuthUser = { id, tenantId, name, email, role: string, isActive, mfaEnabled }
```

Errors: `401` on bad credentials, an inactive account, a locked account, or an expired/reused refresh token; `429` once the rate limit is hit. If the account has MFA enabled, a missing/wrong `mfaCode` fails with `401 MFA_REQUIRED`/`MFA_INVALID` **before** any token is issued — no separate challenge-token step; the client just re-submits the same `POST /login` call with the code filled in.

**Password change & reset** — `newPassword` is validated `min(8)` on both routes. `change-password` verifies `currentPassword` first (`401` if wrong) and revokes every `RefreshToken` for the user (forces re-login on every other device/tab; the caller's current access token stays valid until its natural expiry, same as logout). `forgot-password` never reveals whether the email matched an account — the response message is identical either way; when it does match, a `PasswordResetToken` is issued (30 min TTL, single-use, stored hashed like `RefreshToken`) and an `EMAIL` notification is *attempted* through the same best-effort `dispatchNotification` every other module uses (recorded `FAILED` since no provider is configured anywhere in this codebase yet) — because nothing actually delivers the email, the response also includes the raw `resetToken` directly, but **only outside production** (`env.isProduction`), mirroring how `errorHandler.ts` already hides stack traces in prod. `reset-password` consumes the token (`400 INVALID_RESET_TOKEN` if unknown, expired, or already used) and, like change-password, revokes every `RefreshToken` for the user.

**MFA (TOTP, RFC 6238)** — `Authorization: Bearer` required for all of these:

| Route | Request body | Response |
|---|---|---|
| `POST /mfa/setup` | — | `200 { secret, otpauthUri, recoveryCodes: string[] }` — replaces any previous pending setup; MFA isn't enabled yet |
| `POST /mfa/enable` | `{ code }` | `204` — verifies the code against the pending secret first |
| `POST /mfa/disable` | `{ code }` | `204` |

`otpauthUri` is what a client renders as a QR code for an authenticator app. `recoveryCodes` are shown once — 10 one-time codes, any of which can substitute for a TOTP code at login (each is consumed on use). `400` if the code doesn't verify.

**Sessions & login history** — a session *is* a `RefreshToken` row; no separate device model exists (so no device name, just `createdAt`/`expiresAt`):

| Route | Response |
|---|---|
| `GET /sessions` | `200 [{ id, createdAt, expiresAt }]` — the caller's own non-revoked, non-expired sessions |
| `DELETE /sessions/:id` | `204` — revokes one (e.g. "log out this device"); `404` if it isn't the caller's own |
| `GET /login-history` | `200 [{ id, success, ipAddress, userAgent, createdAt }]` — the caller's own last 50 login attempts, success and failure |

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
| `GET /:id/360` | — | `200 Student360` — see below |
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

**Student 360** (`GET /:id/360`, permission `STUDENT_READ`) — a single read-only aggregation of everything this backend tracks about one student, for the admin dashboard's profile view. Built with direct Prisma queries (not by reusing other modules' paginated list endpoints, which are shaped for their own list pages, not "everything for this id") so it stays one round trip:

```ts
Student360 = {
  student: Student & { departmentName: string, sectionName: string | null },
  attendance: { totalRecords, presentCount, absentCount, lateCount, excusedCount, onLeaveCount, attendancePercentage: number },
  academics: { cgpa: number | null }, // null until any marks are published — see Examinations' getCgpaForStudent
  fees: { invoiceCount, totalInvoiced, totalOutstanding, overdueCount: number }, // totalOutstanding uses the same ledger math as Fees' own status recompute, so it always agrees with that module's numbers
  hostelAllocation: { hostelName, roomNumber, bedNumber, status } | null, // most recent, any status
  transportAllocation: { routeName, stopName, status } | null,           // most recent, any status
  library: { activeIssueCount, overdueIssueCount: number },
  documents: Array<{ id, type, status, createdAt }>,              // 10 most recent
  certificateRequests: Array<{ id, certificateTypeId, status, createdAt }>, // 10 most recent
  activities: Array<{ id, type, title, date }>,                   // 10 most recent, by activity date
  leave: { pendingCount, approvedCount, rejectedCount: number, recent: Array<{ id, leaveTypeId, startDate, endDate, status, createdAt }> }, // recent = 5 most recent
}
```

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
| `GET /:id` | — | `200 Program` |
| `POST /` | body: `ProgramInput` | `201 Program` |
| `PUT /:id` | body: `ProgramInput` | `200 Program` |
| `DELETE /:id` | — | `204` — `409 PROGRAM_IN_USE` if it still has batches or subjects |

```ts
ProgramInput = { departmentId: string, name: string, code: string /* 2–12, uppercased */, durationYears: number /* 1–10 */, status?: "ACTIVE"|"INACTIVE" }
```

`400` if `departmentId` doesn't exist; `409 DUPLICATE_CODE` on a repeated code.

### Batches (`/api/v1/batches`) — module `CORE`

Permissions: `BATCH_READ` / `_CREATE` / `_UPDATE` / `_DELETE`.

Standard `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`.

```ts
BatchInput = { programId: string, academicYearId: string, name: string /* ≤40 */, startYear: number, endYear: number /* > startYear */, status?: "ACTIVE"|"INACTIVE"|"GRADUATED" }
```

`400` on an invalid `programId`/`academicYearId`; `409 DUPLICATE_BATCH` on a repeated name within the program; `409 BATCH_IN_USE` on delete if it still has sections.

### Sections (`/api/v1/sections`) — module `CORE`

Permissions: `SECTION_READ` / `_CREATE` / `_UPDATE` / `_DELETE`.

Standard `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`.

```ts
SectionInput = { batchId: string, name: string /* ≤10 */, currentSemester: number /* 1–12 */, capacity?: number, status?: "ACTIVE"|"INACTIVE" }
```

`409 DUPLICATE_SECTION` on a repeated name within the batch; `409 SECTION_IN_USE` on delete if it still has students or timetable entries.

### Subjects (`/api/v1/subjects`) — module `CORE`

Permissions: `SUBJECT_READ` / `_CREATE` / `_UPDATE` / `_DELETE`.

Standard `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`.

```ts
SubjectInput = { programId: string, semesterNumber: number /* 1–12 */, code: string /* 2–12, uppercased */, name: string, credits: number /* 1–10 */, type?: "CORE"|"ELECTIVE"|"LAB"|"PROJECT"|"SEMINAR"|"PRACTICAL", facultyId?: string }
```

`409 DUPLICATE_CODE`; `409 SUBJECT_IN_USE` on delete if it still has timetable entries.

### Faculty (`/api/v1/faculty`) — module `CORE`

Permissions: `FACULTY_READ` / `_CREATE` / `_UPDATE` / `_DELETE`. A faculty member is both an employee profile and a login-capable account — creating one provisions the underlying `User` (role `FACULTY`) too.

Standard `GET /`, `GET /:id`, `GET /:id/360`, `POST /`, `PUT /:id`, `DELETE /:id`.

```ts
// POST — provisions the login account
FacultyCreateInput = { name, email: string, password: string /* ≥8 */, employeeCode: string, departmentId: string, designation: string, qualification?: string, experienceYears?: number, joiningDate: string, status?: "ACTIVE"|"INACTIVE" }
// PUT — no email/password changes yet
FacultyUpdateInput = Omit<FacultyCreateInput, "email"|"password">
Faculty = FacultyUpdateInput & { id, tenantId, name, email, isActive, createdAt, updatedAt }
```

`409 DUPLICATE_EMAIL` / `DUPLICATE_EMPLOYEE_CODE`. `DELETE` deactivates the linked account (`isActive: false`) rather than deleting it, and `409 FACULTY_IN_USE` if timetable entries still reference them.

**Faculty 360** (`GET /:id/360`, permission `FACULTY_READ`) — same idea as Student 360, reusing the existing `toFacultyDto` flattening:

```ts
Faculty360 = {
  faculty: Faculty & { departmentName: string },
  teaching: { subjectCount: number, subjects: Array<{ id, code, name, semesterNumber, credits }> },
  timetable: { weeklyPeriods: number, entries: Array<{ id, dayOfWeek, startTime, endTime, sectionName, subjectName, roomName }> }, // all entries, not capped
  attendance: { sessionsTaken: number, recentSessions: Array<{ id, date, status, sectionName, subjectName }> }, // recentSessions = 10 most recent
  assignments: { count: number, recent: Array<{ id, title, status, dueDate }> }, // recent = 5 most recent
  leaveReviewed: { count: number }, // LeaveRequest rows this faculty member has reviewed, i.e. reviewedByUserId = their own userId
}
```

### Rooms (`/api/v1/rooms`) — module `CORE`

Permissions: `ROOM_READ` / `_CREATE` / `_UPDATE` / `_DELETE`. Deliberately flat — no building/floor hierarchy yet.

Standard `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`.

```ts
RoomInput = { name: string, code: string /* ≤20, uppercased */, capacity?: number, status?: "ACTIVE"|"INACTIVE" }
```

`409 DUPLICATE_CODE`; `409 ROOM_IN_USE` on delete if it still has timetable entries.

### Timetable (`/api/v1/timetable`) — module `ACADEMICS`

Permissions: `TIMETABLE_READ` / `_CREATE` / `_UPDATE` / `_DELETE`. The one Milestone-1 module gated to `ACADEMICS` instead of `CORE`.

| Route | Request | Response |
|---|---|---|
| `GET /` | query: `page?, pageSize?, sectionId?, facultyId?, roomId?, dayOfWeek?` | `200` paginated `TimetableEntry[]` |
| `GET /:id` | — | `200 TimetableEntry` |
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

**Period slots** (`/timetable/periods`) — the institution's shared daily bell schedule (Period 1, Break, Period 2, ..., Lunch, ...), one flat tenant-wide list ordered by `startTime` (chronological order *is* display order — there's no separate position field). Reuses the same `TIMETABLE_*` permissions above; not a separate module.

| Route | Request | Response |
|---|---|---|
| `GET /periods` | — | `200 PeriodSlot[]`, ordered by `startTime` — not paginated, this is a small complete list |
| `POST /periods` | body: `PeriodSlotInput` | `201 PeriodSlot` |
| `PUT /periods/:id` | body: `PeriodSlotInput` | `200 PeriodSlot` |
| `DELETE /periods/:id` | — | `204` — free to delete, nothing has a hard FK to a period |

```ts
PeriodSlotInput = { label: string, type: "TEACHING"|"BREAK"|"LUNCH", startTime: string, endTime: string } // "HH:mm" 24h, endTime > startTime
PeriodSlot = PeriodSlotInput & { id, tenantId, createdAt, updatedAt }
```

`409 PERIOD_OVERLAP` if the new/updated range overlaps any other period slot (any type) — the response names the conflicting period, e.g. `{ message: "That time overlaps \"Period 1\" (09:00–09:50).", code: "PERIOD_OVERLAP" }`.

`TimetableEntry` deliberately isn't linked to a period by id — the admin frontend's visual grid (`TimetableGrid`) matches an entry to the period row(s) it covers purely by comparing `[startTime, endTime)` overlap, the same math this module's own conflict detection already uses. A lab spanning three periods back-to-back is just one entry whose time range happens to cover three period rows, rendered as a single merged cell — no schema link required, and the entry create/update contract above is completely unchanged.

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
| `GET /requests/:id` | — | `200 LeaveRequest` |
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
| `GET /exams` \| `GET /exams/:id` \| `POST /exams` \| `PUT /exams/:id` \| `DELETE /exams/:id` | `{ name, examType, academicYearId, semesterNumber, startDate, endDate }` | Standard CRUD — `409 EXAM_IN_USE` on delete if schedules exist |
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
| `GET /:id` | — | `200 Document` — staff-tier only |
| `POST /` | `{ ownerType, ownerId, type, fileUrl, expiryDate? }` | `201 Document`, `PENDING` |
| `PUT /:id` | same body | `200` — bumps `version`, resets to `PENDING` (a new file needs re-verification) |
| `DELETE /:id` | — | `204` |
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
| `GET /financial-summary` | — | `{ totalInvoiced, totalCollected, totalOutstanding, byCategory: [{ category, invoiced, collected, outstanding }] }` — mirrors `fee.service.ts`'s own payable calculation; a `WAIVED` invoice owes nothing further regardless of face amount |
| `GET /dropout` | — | `{ total, byDepartment: [{ departmentId, count }], students: [...] }` — the roadmap's "Dropout" report: students `INACTIVE` without ever reaching `ALUMNI`, i.e. left without graduating |

### Import / Export (`/api/v1/import-export`) — module `CORE`, Students only

Permissions: `STUDENT_IMPORT`, `STUDENT_EXPORT`. CSV, not Excel (no binary-parsing dependency added — see `src/utils/csv.ts`). Follows upload → validate → preview → confirm (roadmap §27) minus the Excel specifics; other entities (Faculty, Marks, Attendance) follow the same pattern later, not built yet.

| Route | Request | Response |
|---|---|---|
| `POST /students/preview` | `{ csv: string }` | `200 { totalRows, validCount, invalidCount, results: [{ row, valid, errors? }] }` — validates every row against the live `studentInputSchema`, creates nothing |
| `POST /students/commit` | `{ csv: string }` | `200 { createdCount, failedCount, failed: [{ row, errors }] }` — re-validates; an invalid row is skipped and reported, never partially inserted |
| `GET /students/export` | query: `departmentId?, status?` | `200` `text/csv` |

CSV columns: `firstName,lastName,email,phone,rollNumber,departmentId,gender,dateOfBirth,admissionDate,status,sectionId,currentSemester,guardianName,guardianPhone,address` (`departmentId`/`sectionId` are raw ids, not codes).

### Admissions (`/api/v1/admissions`) — module `ADMISSIONS`

Permissions: `ADMISSION_READ`, `ADMISSION_CREATE`, `ADMISSION_UPDATE`, `ADMISSION_DECIDE` (advance/reject/withdraw), `ADMISSION_ENROLL`. Applicant fields live directly on the application (no separate Applicant entity). Lifecycle: `APPLIED → DOCUMENT_VERIFICATION → SHORTLISTED → APPROVED → OFFERED → ACCEPTED`, one step at a time via `/advance` — `ENROLLED` is reachable **only** through `/enroll`, never generic advance, since that's the action that actually creates the Student row.

| Route | Request | Response |
|---|---|---|
| `GET /` \| `GET /:id` | query: `page?, pageSize?, programId?, status?` | Standard list/get |
| `POST /` | `{ firstName, lastName, email, phone, dateOfBirth, programId }` | `201`, `APPLIED` — `409 DUPLICATE_APPLICATION` for a repeat email+program |
| `PUT /:id` | same body | `200` — `409 APPLICATION_FINALIZED` once `ENROLLED`/`REJECTED`/`WITHDRAWN` |
| `POST /:id/advance` | `{ reviewNotes? }` | `200` — one step forward; `409 ALREADY_AT_FINAL_STAGE` once `ACCEPTED` (use `/enroll`) |
| `POST /:id/reject` \| `/withdraw` | `{ reviewNotes? }` (reject only) | `200` |
| `POST /:id/enroll` | `{ rollNumber, gender, sectionId? }` | `201 Student` (with `admissionApplicationId` set) — `409 NOT_ACCEPTED` unless status is `ACCEPTED`. Creates the Student through the exact same `createStudent` path a manual entry uses; `departmentId` is derived from the application's program. |

### Fees & Finance (`/api/v1/fees`) — module `FINANCE`

Permissions: `FEE_READ`, `FEE_MANAGE`, `PAYMENT_RECORD`, `PAYMENT_REFUND`. **An internal ledger, not a live payment gateway** — payments are admin-recorded (cash, bank transfer, or a gateway not wired up here); Razorpay/Cashfree integration is deferred to a future pass with real credentials. Invoice `status` is recomputed from the ledger on every payment/adjustment write, never trusted as stored truth on its own.

| Route | Request | Response |
|---|---|---|
| `GET /structures` \| `POST /structures` | `{ programId, academicYearId, category, amount }` | `409 DUPLICATE_STRUCTURE` per program/year/category |
| `DELETE /structures/:id` | — | `409 STRUCTURE_IN_USE` if invoices exist |
| `GET /invoices` | query: `page?, pageSize?, studentId?, status?, category?` | Full roster — **staff-tier only** (`FEE_MANAGE`) |
| `GET /invoices/mine` | — | `200 FeeInvoice[]` — self-service |
| `POST /invoices` | `{ studentId, feeStructureId?, category, amount, dueDate }` | `201`, `PENDING` |
| `POST /invoices/:id/adjustments` | `{ type: DISCOUNT\|SCHOLARSHIP\|FINE, amount, reason }` | `200` updated invoice — recomputes status |
| `POST /invoices/:id/waive` | — | `200` — sets `WAIVED`, a sticky manual override the recompute leaves alone |
| `POST /invoices/:id/payments` | `{ amount, method, transactionRef? }` | `201 Payment` — `409 INVOICE_SETTLED` once `PAID`/`WAIVED` |
| `POST /payments/:id/refund` | `{ amount, reason }` | `201 Payment` (`isRefund: true`) — recomputes the invoice back out of `PAID` |

`category: TUITION\|HOSTEL\|TRANSPORT\|EXAM\|LIBRARY\|LAB\|OTHER`. `status: PENDING\|PARTIAL\|PAID\|OVERDUE\|WAIVED`.

### Hostel (`/api/v1/hostel`) — module `HOSTEL_TRANSPORT`

Permissions: `HOSTEL_READ`, `HOSTEL_MANAGE`, `HOSTEL_ALLOCATE`. Flat — no Building/Floor; `bedNumber` is a plain field, auto-assigned to the lowest free number, with capacity checked in the service layer (no DB constraint).

| Route | Request | Response |
|---|---|---|
| `GET /hostels` \| `POST /hostels` \| `DELETE /hostels/:id` | `{ name }` | `409 HOSTEL_IN_USE` on delete if rooms exist |
| `GET /rooms` \| `POST /rooms` \| `DELETE /rooms/:id` | `{ hostelId, roomNumber, capacity }` | `409 ROOM_IN_USE` on delete for any allocation history (not just active — the FK doesn't care about status) |
| `GET /allocations` | query: `page?, pageSize?, studentId?, hostelRoomId?, status?` | Full roster — **staff-tier only** (`HOSTEL_MANAGE`) |
| `GET /allocations/mine` | — | self-service |
| `POST /allocations` | `{ studentId, hostelRoomId, startDate }` | `201` — `409 ROOM_FULL` / `ALREADY_ALLOCATED` |
| `POST /allocations/:id/vacate` | — | `200`, `status: INACTIVE` |

### Transport (`/api/v1/transport`) — module `HOSTEL_TRANSPORT`

Permissions: `TRANSPORT_READ`, `TRANSPORT_MANAGE`, `TRANSPORT_ALLOCATE`. Driver name/phone are plain fields on `Vehicle` (no separate Driver entity).

| Route | Request | Response |
|---|---|---|
| `GET/POST /vehicles`, `DELETE /vehicles/:id` | `{ registrationNumber, driverName, driverPhone, capacity }` | `409 VEHICLE_IN_USE` on delete if assigned to routes |
| `GET/POST /routes`, `DELETE /routes/:id` | `{ name, vehicleId? }` | `409 ROUTE_IN_USE` on delete for any stops or allocation history |
| `POST /routes/:id/stops`, `DELETE /stops/:id` | `{ name, sequence }` | `409 DUPLICATE_SEQUENCE`; `409 STOP_IN_USE` on delete for any allocation history |
| `GET /allocations` | query: `page?, pageSize?, studentId?, routeId?, status?` | Full roster — **staff-tier only** (`TRANSPORT_MANAGE`) |
| `GET /allocations/mine` | — | self-service |
| `POST /allocations` | `{ studentId, routeId, stopId }` | `201` — `409 ALREADY_ALLOCATED` |
| `POST /allocations/:id/remove` | — | `200`, `status: INACTIVE` |

### Library (`/api/v1/library`) — module `LIBRARY`

Permissions: `LIBRARY_READ`, `LIBRARY_MANAGE`, `LIBRARY_ISSUE`. Author/publisher/category are plain fields (no normalized tables); `availableCopies` tracked directly on `Book`. An issue's status (issued/returned/overdue) is derived from `returnedAt`/`dueDate` on read, never stored.

| Route | Request | Response |
|---|---|---|
| `GET /books` \| `GET /books/:id` \| `POST /books` \| `PUT /books/:id` \| `DELETE /books/:id` | `{ title, author, publisher?, category?, isbn?, totalCopies }` | `409 BOOK_IN_USE` on delete for any issue history |
| `GET /issues` | query: `page?, pageSize?, bookId?, ownerType?, ownerId?` | Full roster — **staff-tier only** (`LIBRARY_MANAGE`) |
| `GET /issues/mine` | — | self-service, resolved via the caller's Student or Faculty profile |
| `POST /issues` | `{ bookId, ownerType: STUDENT\|FACULTY, ownerId, dueDate }` | `201` — `409 NO_COPIES_AVAILABLE` |
| `POST /issues/:id/return` | — | `200` — computes `fineAmount` (₹10/day late, `null` if on time) |

### Certificates (`/api/v1/certificates`) — module `CORE`

Permissions: `CERTIFICATE_READ`, `CERTIFICATE_REQUEST` (self-service), `CERTIFICATE_ISSUE`. Distinct from Documents — this is the *issuance* workflow (roadmap §22: template/generatedBy/generatedAt/verification), not arbitrary file uploads.

| Route | Request | Response |
|---|---|---|
| `GET /types` \| `POST /types` \| `DELETE /types/:id` | `{ name, category? }` | `409 CERTIFICATE_TYPE_IN_USE` on delete if requests exist |
| `POST /requests` | `{ certificateTypeId, studentId? }` | `201`, `REQUESTED` |
| `GET /requests` | query: `page?, pageSize?, studentId?, status?` | Full roster — **staff-tier only** (`CERTIFICATE_ISSUE`) |
| `GET /requests/mine` | — | self-service |
| `POST /requests/:id/issue` | — | `200` — sets a random `verificationCode`; `409 ALREADY_REVIEWED` if not `REQUESTED` |
| `POST /requests/:id/reject` | `{ rejectionReason }` | `200` |
| `GET /verify/:code` | — | `200 { valid: true, certificateType, studentName, rollNumber, issuedAt }` or `{ valid: false }` — stands in for "digital signature/QR"; no PDF/QR library added, the code itself is what a real QR would encode. Requires auth (not a public endpoint) — that's a deliberate scope boundary, not the eventual design. |

### Student Activities (`/api/v1/activities`) — module `CORE`

Permissions: `ACTIVITY_READ`, `ACTIVITY_MANAGE` (staff, any student), `ACTIVITY_SELF_REPORT` (student, own only). One lightweight record type covering achievements/events/clubs/sports/competitions/internships.

| Route | Request | Response |
|---|---|---|
| `GET /` | query: `page?, pageSize?, studentId?, type?` | Full roster — **staff-tier only** (`ACTIVITY_MANAGE`) |
| `GET /mine` | — | self-service |
| `GET /:id` | — | `200 StudentActivity` |
| `POST /` | `{ type, title, description?, date, certificateUrl?, studentId? }` | `201` — `studentId` resolves to the caller's own profile if omitted |
| `PUT /:id` \| `DELETE /:id` | — | staff-tier only (no self-editing after creation) |

`type: ACHIEVEMENT\|EVENT\|CLUB\|SPORTS\|COMPETITION\|INTERNSHIP\|OTHER`.

### Placements (`/api/v1/placements`) — module `PLACEMENT_ALUMNI`

Permissions: `PLACEMENT_READ`, `PLACEMENT_MANAGE`, `PLACEMENT_APPLY` (self-service). No separate Interview/PlacementResult entities — both fold into the application's status and fields.

| Route | Request | Response |
|---|---|---|
| `GET/POST /companies`, `DELETE /companies/:id` | `{ name, website? }` | `409 COMPANY_IN_USE` on delete if openings exist |
| `GET/POST /openings`, `GET /openings/:id`, `DELETE /openings/:id` | `{ companyId, title, description?, minCgpa?, ctcOffered?, applicationDeadline? }` | `409 OPENING_IN_USE` on delete if applications exist |
| `POST /openings/:id/apply` | `{ studentId? }` | `201`, `APPLIED` — `409 CGPA_NOT_MET` if below `minCgpa` (via `examinations`' CGPA calculation), `409 DEADLINE_PASSED`, `409 ALREADY_APPLIED` |
| `GET /applications` | query: `page?, pageSize?, jobOpeningId?, studentId?, status?` | Full roster — **staff-tier only** (`PLACEMENT_MANAGE`) |
| `GET /applications/mine` | — | self-service |
| `PUT /applications/:id/status` | `{ status: SHORTLISTED\|INTERVIEW\|SELECTED\|REJECTED, notes?, offeredCtc? }` | `200` — `409 APPLICATION_FINALIZED` once `SELECTED`/`REJECTED` |

### Billing (`/api/v1/billing`) — module `CORE`

Permissions: `BILLING_READ`, `BILLING_MANAGE` (SUPER_ADMIN/COLLEGE_ADMIN tier — platform-wide concern, not extended to department level). **An internal ledger, not a live payment gateway** — same reasoning as Fees. `Plan` is a global, seed-managed catalogue (`prisma/seed.ts` → `billing.seed.ts`); there's no tenant-facing plan-authoring endpoint, only a read-only catalogue, so no tenant admin can pollute a resource every other tenant sees.

| Route | Request | Response |
|---|---|---|
| `GET /plans` | — | `200 Plan[]` — the global catalogue (FREE/PRO/ENTERPRISE, seeded) |
| `GET /subscription` | — | `200 Subscription` (with `plan`) — `404` if the tenant hasn't set one |
| `PUT /subscription` | `{ planId }` | `200 Subscription` — creates or changes the caller's **own** tenant's subscription only |
| `POST /subscription/cancel` | — | `200 Subscription` — sets `cancelAtPeriodEnd: true` |
| `GET /invoices` | query: `page?, pageSize?, status?` | `200` paginated `BillingInvoice[]` |
| `POST /invoices` | `{ amount?, periodStart, periodEnd }` | `201 BillingInvoice`, `PENDING` — `amount` defaults to the plan's `priceMonthly` |
| `POST /invoices/:id/pay` | — | `200` — `409 ALREADY_PAID` if already paid |
| `GET /usage` | — | `200 { plan, students: { used, limit }, faculty: { used, limit } }` — computed on read against the active plan's limits, never stored |

### API Keys (`/api/v1/api-keys`) — module `CORE`

Permissions: `API_KEY_READ`, `API_KEY_MANAGE`. A key authenticates **as its creating user** — it inherits that user's exact tenantId/role/permissions rather than a separate scope system, so it reuses every existing `requirePermission` check as-is. Present it via `X-API-Key: <key>` instead of `Authorization: Bearer` on any route.

| Route | Request | Response |
|---|---|---|
| `GET /` | — | `200 [{ id, name, keyPrefix, lastUsedAt, revokedAt, createdAt, createdBy }]` — never the raw key or its hash |
| `POST /` | `{ name }` | `201 { id, name, keyPrefix, createdAt, key }` — `key` is the raw secret, **returned exactly once**; only its SHA-256 hash is stored |
| `DELETE /:id` | — | `204` — revokes; a revoked key stops authenticating immediately |

### Webhooks (`/api/v1/webhooks`) — module `CORE`

Permissions: `WEBHOOK_READ`, `WEBHOOK_MANAGE`. Delivery is a single inline HMAC-signed `fetch` at the moment an event fires — no retry queue yet (matching "no BullMQ until a module actually needs one"); `WebhookDelivery` is what a future queue-backed retry would read from. Tenant-supplied URLs get POSTed to by this server — a real SSRF vector — so every URL must be `https://`, non-localhost, and resolve to a public IP (`src/utils/ssrfGuard.ts`), checked both at registration **and** immediately before every delivery attempt (defends against DNS rebinding between the two).

| Route | Request | Response |
|---|---|---|
| `GET /` | — | `200 WebhookEndpoint[]` |
| `POST /` | `{ url, eventTypes: string[], enabled? }` | `201 WebhookEndpoint` — `400` if the URL fails the SSRF check |
| `PATCH /:id` | `{ url?, eventTypes?, enabled? }` | `200 WebhookEndpoint` |
| `DELETE /:id` | — | `204` |
| `GET /:id/deliveries` | query: `page?, pageSize?` | `200` paginated `WebhookDelivery[]` |

Each delivery POSTs `{ event, data }` with headers `X-Webhook-Event` and `X-Webhook-Signature` (HMAC-SHA256 of the body, keyed by the endpoint's per-registration `secret`). Currently fired from 3 representative call sites — student creation (`student.created`), admission enrollment (`admission.enrolled`), and a fee invoice becoming fully paid (`fee.invoice.paid`) — as a demonstration of the dispatcher, not a rewrite of every module.

### Integrations (`/api/v1/integrations`) — module `CORE`

Permissions: `INTEGRATION_READ`, `INTEGRATION_MANAGE`. **Config only — no code path here ever calls out to any of these providers.** Same "config exists, integration itself is future work" pattern as the Notifications deferral.

| Route | Request | Response |
|---|---|---|
| `GET /` | — | `200 IntegrationConfig[]` |
| `PUT /:provider` | `{ enabled, settings? }` | `200 IntegrationConfig` — upsert; one row per `(tenant, provider)` |

`provider: PAYMENT_GATEWAY \| EMAIL \| SMS \| FIREBASE \| GOOGLE_WORKSPACE \| MICROSOFT_365 \| BIOMETRIC_ATTENDANCE \| ACCOUNTING_SOFTWARE \| LMS \| LIBRARY_SYSTEM`. `settings` is plain JSON, not encrypted — a documented limitation (production would need a KMS-backed secret store), not an oversight.

### Approvals (`/api/v1/approvals`) — module `CORE`

Permissions: `APPROVAL_READ` (also granted to `STAFF`), `APPROVAL_MANAGE` (`DEPARTMENT_ADMIN`/`HOD` and up). A **minimal, generic** engine — deliberately not the roadmap's full Workflow/WorkflowStep pair, since no concrete multi-step chain exists yet to justify it. Available for the next new approval-shaped feature; the six existing per-module approval flows (attendance corrections, marks revisions, leave, admissions, fee waivers, document verification) are untouched and don't route through this.

| Route | Request | Response |
|---|---|---|
| `GET /` | query: `page?, pageSize?, status?, type?` | `200` paginated `ApprovalRequest[]` |
| `POST /` | `{ type, entity, entityId, reason? }` | `201`, `PENDING` — `type` is a free-form string a future module names |
| `POST /:id/approve` \| `/reject` | `{ decisionNotes? }` | `200` — `409 ALREADY_DECIDED` if not `PENDING` |

### Notifications (`/api/v1/notifications`) — module `CORE`

Permission: `NOTIFICATION_READ` (granted broadly — every logged-in-capable role). Purely self-account-management: every route always operates on the caller's own notifications, there's no way to read or manage anyone else's. Roadmap §13's entities minus `NotificationTemplate` — deliberately not built, same "minimal, not the full model" call as the approval engine, since there's no library of reusable templates yet to justify one.

| Route | Request | Response |
|---|---|---|
| `GET /` | query: `page?, pageSize?, unreadOnly?` | `200` paginated `Notification[]` |
| `GET /unread-count` | — | `200 { count }` |
| `POST /:id/read` | — | `204` |
| `POST /read-all` | — | `204` — marks every unread notification read |
| `GET /preferences` | — | `200 [{ channel: "EMAIL"\|"SMS"\|"PUSH", enabled }]` — `IN_APP` isn't listed, it can't be disabled |
| `PUT /preferences/:channel` | `{ enabled }` | `200 { channel, enabled }` — `400` for `channel: IN_APP` |

**How delivery actually works:** `IN_APP` is always real — creating the `Notification` row *is* the delivery, immediately visible via `GET /`. `EMAIL`/`SMS`/`PUSH` only get attempted (and logged) if the tenant has the mapped `IntegrationConfig` enabled (`EMAIL`→`EMAIL`, `SMS`→`SMS`, `PUSH`→`FIREBASE` — see Integrations above) **and** the user hasn't opted out; even then, the resulting `NotificationDelivery` row is recorded `FAILED` with a clear reason, since no live provider call exists anywhere in this codebase — same "config exists, sending is future work" boundary as Integrations itself.

**What triggers a notification today:**
- Publishing an announcement (`POST /announcements`, when `publishAt` is now or in the past) — fans out to the resolved audience, type `ANNOUNCEMENT_PUBLISHED`. A future-dated `publishAt` does **not** get a catch-up notification when it actually goes live — there's no separate "just published" scheduler, only the reminder scan below.
- A class group message (see Class Groups below) — type `CLASS_GROUP_MESSAGE`.
- The periodic announcement-expiry reminder scan — type `ANNOUNCEMENT_REMINDER`.

**Announcement expiry reminders (background job):** the roadmap's own stated reason for a job queue ("use background jobs instead of doing every notification synchronously") — the first real BullMQ usage in this codebase (`src/queue/`). A repeatable job runs every 15 minutes, scanning every tenant for announcements whose `expiryAt` falls within the next 24h and that haven't been reminded about yet (`Announcement.reminderSentAt`); each match gets a reminder notification to its original audience and `reminderSentAt` set so it's never re-sent. The worker runs in-process alongside the API server (`server.ts`) — not a separate deployment at this scale. Immediate fan-out (announcement publish, class group messages) stays synchronous in the request path, same as Webhooks' inline fetch; only this recurring scan goes through the queue.

### Class Groups (`/api/v1/class-groups`) — module `CORE`

Permissions: `CLASS_GROUP_READ`/`CLASS_GROUP_POST` (STUDENT/FACULTY — membership-gated, see below), `CLASS_GROUP_MANAGE` (DEPARTMENT_ADMIN/HOD and up — bypasses membership, any section). Not in the roadmap — a Section already *is* the class, so there's no separate `ClassGroup` entity, just messages scoped by `sectionId`; membership is derived on read from existing relations (`Student.sectionId`, `TimetableEntry.facultyId` for that section), not a stored membership list.

| Route | Request | Response |
|---|---|---|
| `GET /:sectionId/messages` | query: `page?, pageSize?` | `200` paginated `ClassGroupMessage[]` (with `author: { id, name }`) |
| `POST /:sectionId/messages` | `{ body }` | `201` — fans out an in-app `CLASS_GROUP_MESSAGE` notification to every other member (active students in the section + faculty who teach it, via Timetable) |

`404` for an unknown section. `403` if the caller is neither a member (a student in that section, or a faculty member with a `TimetableEntry` there) nor holds `CLASS_GROUP_MANAGE`.

### Global Search (`/api/v1/search`) — module `CORE`

No single permission gate at the router level — unlike every other module, which categories run at all depends on which permissions the caller's role holds, checked per-category inside the service via the same `getPermissionsForRole` cache `requirePermission` itself uses.

| Route | Request | Response |
|---|---|---|
| `GET /` | query: `q` (string, `min(2)`) | `200 GlobalSearchResult` |

```ts
GlobalSearchResult = {
  students: SearchHit[], faculty: SearchHit[], departments: SearchHit[],
  programs: SearchHit[], batches: SearchHit[], sections: SearchHit[], subjects: SearchHit[],
}
SearchHit = { id, type: "student"|"faculty"|"department"|"program"|"batch"|"section"|"subject", label: string, subtitle: string }
```

Case-insensitive partial match per category (students: name/email/roll number; faculty: name/email/employee code; the rest: name/code), capped at 8 results each, newest-first. A category the caller's role can't read (missing `STUDENT_READ`/`FACULTY_READ`/`DEPARTMENT_READ`/`PROGRAM_READ`/`BATCH_READ`/`SECTION_READ`/`SUBJECT_READ` respectively) always comes back as `[]`, never an omitted key — the response shape is fixed regardless of role. `422` if `q` is shorter than 2 characters.

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
│                 # admissions, fees, hostel, transport, library, certificates,
│                 # activities, placements, billing, api-keys, webhooks, integrations,
│                 # approvals, notifications, class-groups,
│                 # shared (audit-log writer + own-student/own-faculty resolvers)
├── prisma/       # Prisma client + extension, tenant context (AsyncLocalStorage)
├── queue/        # BullMQ connection, notification reminder queue + worker
├── utils/        # ApiError and other shared helpers
├── app.ts        # Express app wiring (middleware, /api/v1 routes)
└── server.ts     # process entry point — also starts the notification worker + schedules its repeatable job
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
- MFA is TOTP (RFC 6238) implemented from scratch over Node's built-in `crypto` (`src/utils/totp.ts`) — no new dependency. `User.mfaSecret` is stored in plaintext, not encrypted — a real, documented limitation (TOTP verification needs to recompute the HMAC, so it can't be hashed the way passwords are; production would need a KMS-backed secret store). Recovery codes are hashed like refresh tokens (SHA-256) and single-use.
- API keys authenticate as their creating user (inheriting that user's tenant/role/permissions) and are stored the same way refresh tokens are — only a SHA-256 hash, never the raw key, with the raw key shown exactly once at creation.
- Webhook endpoint URLs are checked against `src/utils/ssrfGuard.ts` (https-only, no localhost, no private/link-local IP ranges, checked via DNS resolution) both at registration and immediately before every delivery — tenant-supplied URLs POSTed to by this server are a real SSRF vector, not a hypothetical one.
- `npm audit`: as of this writing, `prisma`'s CLI has unresolved advisories in its bundled MySQL driver and config-merging dependency (mysql2, deepmerge-ts) — these affect Prisma's dev-time CLI tooling, not the `@prisma/client` runtime library actually used by the running API, and we only use the Postgres driver. Re-check on each dependency bump.
