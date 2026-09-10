# CampusOne API — Project Context for Claude Code

## What this is

The backend for **CampusOne**, a multi-tenant SaaS college management platform. Any college signs up as a tenant; features are enabled per tenant like installable modules.

**Two separate repos, not a monorepo:** this repo is the API. The frontend lives in a sibling repo, `campusone-admin`. They're paired over HTTP/CORS with no shared package; types are duplicated by hand on each side for now.

**Product roadmap:** `CampusOne_Product_Ready_API_Roadmap.md` (this repo) is the source of truth for the full target product — entity models, release plan, and build order — and supersedes this file's sequencing where the two conflict. This backend now builds ahead of the frontend; endpoints are no longer gated on a matching frontend mock existing first (that was the rule through Milestone 1's predecessor, no longer current).

## Tech stack (decided)

- **Backend:** Express 5 + TypeScript
- **ORM/DB:** Prisma + PostgreSQL
- **Auth:** JWT access token + opaque refresh token (httpOnly cookie)
- **Validation:** Zod
- **Background jobs:** BullMQ/Redis (Redis runs via docker-compose already; no queue/processor exists until a module actually needs one — don't add one speculatively)
- **Payments (later):** Razorpay or Cashfree (native UPI — non-negotiable for India)
- **Notifications (later):** WhatsApp Business API + SMS/email fallback (e.g. Gupshup)

## API versioning

All routes are mounted under `/api/v1` (see `src/app.ts`). `/health`, `/health/live`, `/health/ready` stay unversioned — infra probes shouldn't need updating when the API version changes.

## Multi-tenancy — the most important architectural decision

- Pooled: one Postgres database, one schema, every table carries a `tenantId` column.
- Enforce isolation with **Postgres Row-Level Security** — never rely on app-level `WHERE tenantId = ...` as the only guard. RLS is the last line of defense.
- Prisma middleware (`$use`) is removed in Prisma 7 — use a **Prisma Client Extension** that runs `SET_CONFIG('app.current_tenant', ...)` at the start of each request/transaction, paired with an RLS policy on every tenant-scoped table.
- Carry `tenantId` (and the authenticated user/role/requestId) through the request lifecycle via `AsyncLocalStorage`, set once in middleware right after auth verification — not threaded as a parameter through every function, that's how it gets forgotten and a cross-tenant leak slips through.
- Never let a query reach a service/route handler without a resolved `tenantId` in context. A resolved tenant is a precondition, not something each handler re-checks.
- Migration path for large customers later: schema-per-tenant, then dedicated DB per tenant — don't build these now, just don't make pooled-only assumptions (e.g. hardcoded cross-tenant joins) that would block the upgrade.

## RBAC — permissions, not hardcoded roles

- `Role`/`Permission`/`RolePermission`/`UserRole` are DB tables (`src/modules/rbac`), not a fixed enum — a tenant-scoped `Role` is a named bundle of permissions, seeded by `src/modules/rbac/rbac.seed.ts` for every tenant.
- The 10 system roles: `PLATFORM_ADMIN` (the only cross-tenant one — `tenantId` null) → `SUPER_ADMIN`/`COLLEGE_ADMIN` → `DEPARTMENT_ADMIN`/`HOD` → `FACULTY`/`STAFF`/`EXAM_ADMIN` → `STUDENT`/`PARENT`. Default grants per role live in `src/modules/rbac/permissions.ts` — that file is the single source of truth for what each permission key means.
- Route guards call `requirePermission('STUDENT_READ')`, never a role name — `src/middleware/requireAuth.ts`. This is what lets grants change as data later without touching route code.
- The JWT carries a role *name* (string), not permissions — `requirePermission` resolves name → granted permissions per-request through a short-TTL cache (`src/modules/rbac/permissionCache.ts`), so a revoked grant takes effect within seconds instead of only after the token expires.
- Every permission check is still "does user X's role have permission Y inside tenant Z" — never just "does this permission exist somewhere."
- **Gotcha:** grants are only synced onto a tenant's roles at seed time (`seedTenantRoles`, called at tenant creation). Extending `permissions.ts`'s `DEFAULT_ROLE_PERMISSIONS` later doesn't retroactively grant existing tenants anything — re-run `seedTenantRoles(tenantId)` (or `npm run prisma:seed` for the demo tenant) after adding permission keys, or an existing SUPER_ADMIN can 403 on a brand-new route. Bit us once building Milestone 2's Academic Management permissions.
- **Self-service pattern:** a route a student/faculty member performs on their own record (mark attendance, submit an assignment, request leave, view own marks) accepts an optional explicit id (lets staff act on someone's behalf) and otherwise resolves the caller's own profile via `Student.userId`/`Faculty.userId` — see `resolveOwnStudentId`/`resolveOwnFacultyId` in `src/modules/shared/`. `Student.userId` is nullable (most students have no login yet, added in Milestone 2 specifically to make this resolution possible) — there's no self-registration/account-linking flow yet, so it's only populated by test fixtures and future admin tooling.

## Module system

- Platform core (always on) + installable modules. A `tenant_modules` table maps `tenantId → moduleId → enabled + planTier`.
- Every API route checks module entitlement via `requireModule(moduleId)` (`src/middleware/requireModule.ts`) before executing, mirroring the frontend's route-level checks — a disabled module must 403, not just hide the UI button. `CORE` is implied always-on and never stored in `tenant_modules`.
- Module list (rough plan-tier grouping):
  - **Core (always on):** tenant onboarding, auth/RBAC, institution settings, academic-year/department/program/batch/section/subject/faculty/student structure, dashboard, audit log
  - **Academics:** timetable, attendance, marks/grading, assignments, LMS basics
  - **Admissions/CRM:** enquiry → application → admission pipeline
  - **Fee/Finance:** fee structure, UPI payments, receipts, concessions
  - **Examination:** scheduling, hall tickets, results, transcripts, CBCS/credit handling
  - **HR/Payroll:** staff profiles, leave, biometric attendance, salary/PF/ESI/TDS
  - **Library, Hostel/Transport**
  - **Placement/Alumni**
  - **Communication:** one engine for SMS/WhatsApp/email/push, used by every other module
  - **Compliance/Reporting (enterprise):** NAAC/NBA/NIRF/AISHE export-ready reports
  - **Inventory/Procurement (enterprise, later phase)**
- Platform admin console (internal, not tenant-facing): tenant list, module enable/disable, plan management, per-tenant usage, impersonate-for-support. Not built yet — there's no tenant-onboarding endpoint either; tenants are created via `prisma/seed.ts` or directly for now.

## Development sequencing

Milestone 1 ("Core ERP Foundation" — roadmap's Release 1) is built: RBAC engine, module entitlement enforcement, `/api/v1` versioning, request IDs, the Institution/AcademicYear/Program/Batch/Section/Subject/Faculty/Room hierarchy, Timetable with conflict detection, structured audit log, Departments/Students (pre-existing, now on the RBAC engine), Dashboard.

Milestone 2 ("Academic Management" — roadmap's Release 2) is also built: Attendance (session lock + correction/approval workflow), Leave (integrated with Attendance), Assignments, Examinations (Exam/Schedule/Marks with the draft→submit→verify→publish workflow, SGPA/CGPA computed on read), Announcements, Documents, Reports (read-only aggregations, no new models), and Import/Export (student CSV only). This is the first real use of the `EXAMINATION` and `COMMUNICATION` modules and of `EXAM_ADMIN`'s permission grants — all three were scaffolded in Milestone 1 with nothing to gate/grant yet.

Milestone 3 ("College Operations" — roadmap's Release 3) is also built: Admissions (applicant → lifecycle → enroll, which creates the real Student via the same path a manual entry uses), Fees & Finance (an internal ledger — `FeeStructure → FeeInvoice → Payment`, invoice status recomputed from the ledger on every write; deliberately **not** a live Razorpay/Cashfree integration, which needs real credentials this environment doesn't have and is deferred to its own future pass), Hostel, Transport, Library, Certificates (the issuance workflow, distinct from Documents' arbitrary file uploads), Student Activities, and Placements. This is the first real use of the `ADMISSIONS`, `FINANCE`, `HOSTEL_TRANSPORT`, `LIBRARY`, and `PLACEMENT_ALUMNI` modules — only `HR_PAYROLL`, `COMPLIANCE_REPORTING`, and `INVENTORY_PROCUREMENT` remain unused now.

Next, per the roadmap's Priority Order (§43) and Release Plan (§42) — Release 4: SaaS billing/subscriptions/usage limits → SSO/MFA/API keys/webhooks/integrations → advanced analytics → the generic Workflow/Approval engine (§24, deliberately deferred through every milestone so far in favor of per-module state machines — see the "Key Product Principle" in the roadmap, §45). See the roadmap doc for the full entity models before building any of these.

## Matching the frontend's mock contract

No longer a hard gate (see "What this is" above), but still useful signal where it exists: the frontend was built against a mock service layer (`campusone-admin/src/services/api`) for its V1 scope (auth, dashboard, departments, students). Where a mock already exists, check its request/response shape before diverging from it — matching it means the frontend's service layer only needs its `fetch` implementation swapped in. Endpoints beyond V1 (everything Milestone 1 added) have no mock to match; the roadmap doc and this repo's own Zod schemas are the contract instead. The paginated-response envelope (`{ data, meta: { page, pageSize, total, totalPages } }`) stays the standard for every list endpoint regardless.
