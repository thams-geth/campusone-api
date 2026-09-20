# CampusOne API — Project Context for Claude Code

## What this is

The backend for **CampusOne**, a multi-tenant SaaS college management platform. Any college signs up as a tenant; features are enabled per tenant like installable modules.

**Two separate repos, not a monorepo:** this repo is the API. The frontend lives in a sibling repo, `campusone-admin`. They're paired over HTTP/CORS with no shared package; types are duplicated by hand on each side for now.

**Product roadmap:** `CampusOne_Product_Ready_API_Roadmap.md` (this repo) is the source of truth for the full target product — entity models, release plan, and build order — and supersedes this file's sequencing where the two conflict. This backend now builds ahead of the frontend; endpoints are no longer gated on a matching frontend mock existing first (that was the rule through Milestone 1's predecessor, no longer current).

## Docs are part of the change, not a follow-up

Four places describe the API's surface, and they must stay in sync **within the same change**, not
as a later pass:

- `README.md` — the prose API reference (routes, request/response shapes, error codes, per-module notes)
- `CLAUDE.md` (this file) — architecture rationale and the milestone log
- `docs/openapi.yaml` — the Swagger spec served at `/api/docs`; every path/method must match the actual `*.routes.ts` registrations exactly (see the diff method used below)
- `docs/handbook.html` — the standalone visual guide (architecture diagrams, role-by-role usage, core flows)

**Whenever a route, permission, module, or role's grants change** (add, remove, rename, or reshape a
request/response), update all four in the same pass — not just the code. A route that exists in
`*.routes.ts` but not in `docs/openapi.yaml` is a real bug, not a documentation nicety: it already
happened once (16 endpoints were missing — mostly get-by-id routes — caught by scripting a diff
between the route files and the spec). Before considering an API change done:

1. Update the relevant module section in `README.md`.
2. Update `CLAUDE.md`'s milestone log if the change is new scope (a new module, a new cross-cutting
   pattern) rather than a fix within existing scope.
3. Update `docs/openapi.yaml` — same path, method, request/response shape as the code. If more than a
   couple of routes changed, re-run the extraction-and-diff approach (grep every `*.routes.ts` for its
   `.get/.post/.put/.patch/.delete(...)` calls, normalize `:param` → `{param}`, and diff the resulting
   set against `yaml.parse(docs/openapi.yaml).paths`) rather than eyeballing it — that's what caught
   the 16 missing routes and it's cheap to re-run.
4. Update `docs/handbook.html` if the change affects architecture, a documented flow (the numbered
   figures), the role table, or the module reference table — not needed for a docs-invisible internal
   refactor.
5. Verify `docs/openapi.yaml` still parses (`YAML.parse` via the `yaml` package) and, if
   `docs/handbook.html` changed, sanity-check it renders — a quick headless-Chrome screenshot (see the
   pattern used to build it) beats shipping a silently broken figure.

## Tech stack (decided)

- **Backend:** Express 5 + TypeScript
- **ORM/DB:** Prisma + PostgreSQL
- **Auth:** JWT access token + opaque refresh token (httpOnly cookie)
- **Validation:** Zod
- **Background jobs:** BullMQ/Redis — one real queue exists (`src/queue/`), the notification reminder scan; don't add another speculatively, only when a module actually needs one
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

Milestone 3 ("College Operations" — roadmap's Release 3) is also built: Admissions (applicant → lifecycle → enroll, which creates the real Student via the same path a manual entry uses), Fees & Finance (an internal ledger — `FeeStructure → FeeInvoice → Payment`, invoice status recomputed from the ledger on every write; deliberately **not** a live Razorpay/Cashfree integration, which needs real credentials this environment doesn't have and is deferred to its own future pass), Hostel, Transport, Library, Certificates (the issuance workflow, distinct from Documents' arbitrary file uploads), Student Activities, and Placements. This is the first real use of the `ADMISSIONS`, `FINANCE`, `HOSTEL_TRANSPORT`, `LIBRARY`, and `PLACEMENT_ALUMNI` modules.

Milestone 4 ("Enterprise SaaS" — roadmap's Release 4) is also built, with the scope split agreed up front: build everything self-contained for real, stub what genuinely needs external credentials, and build a minimal (not the full Workflow/WorkflowStep) approval engine.
- **Built for real:** Billing (internal subscription/invoice ledger, same reasoning as Fees — `Plan` is a global seed-managed catalogue, not tenant-authored), MFA (TOTP/RFC 6238 implemented from scratch over Node's `crypto`, no new dependency — `src/utils/totp.ts`), login history, session list/revoke (reuses `RefreshToken` — no new session model), API Keys (a key authenticates *as its creating user*, inheriting their tenant/role/permissions rather than a separate scope system — `requireAuth` accepts `X-API-Key` as an alternate credential), Webhooks (`WebhookEndpoint`/`WebhookDelivery`, inline HMAC-signed delivery, no retry queue — SSRF-guarded via `src/utils/ssrfGuard.ts` at both registration and every delivery attempt), two Reports additions (`financial-summary`, `dropout` — extend the existing module, no new one), and a minimal generic `ApprovalRequest` engine (`POST /approvals`, approve/reject — the six existing per-module approval flows are untouched).
- **Deliberately config-only, zero live calls:** Integrations (`IntegrationConfig` covers the roadmap's full third-party list — payment gateway, email/SMS, Firebase, Google Workspace, Microsoft 365, biometric attendance, accounting software, LMS, library systems — as enable/disable + JSON settings; no code path calls out to any of them, same pattern as the Notifications deferral). Real SSO federation (SAML/OAuth against an actual IdP) is out of scope entirely — it needs a registered app + client secret this environment doesn't have.
- This is the first (and only, by design) use of `IntegrationConfig`/`ApprovalRequest`-style platform-tier permissions — Billing/API-Key/Webhook/Integration grants stay at `SUPER_ADMIN`/`COLLEGE_ADMIN` tier only, not extended to `DEPARTMENT_ADMIN`/`HOD`/`STAFF` the way College Operations was; Approvals is the exception (`STAFF` gets read-only, `DEPARTMENT_ADMIN`/`HOD` get full manage) since it's meant for general reuse.
- `HR_PAYROLL`, `COMPLIANCE_REPORTING`, and `INVENTORY_PROCUREMENT` remain unused — genuinely out of scope for the current roadmap, not deferred-with-intent like the items above.

All four roadmap releases are now built. Anything beyond this point is new scope, not a continuation of a planned milestone — see the roadmap doc's own "beyond Release 4" notes if any exist before assuming there's a fifth one.

**Post-Release-4: Notifications + Class Groups** (user request, not a roadmap milestone). Notifications follow the roadmap's §13 model (`Notification`/`NotificationDelivery`/`NotificationPreference`, channels `IN_APP`/`EMAIL`/`SMS`/`PUSH`) minus `NotificationTemplate` — deliberately skipped, same "minimal, not the full model" call as the approval engine, since there's no template library yet to justify one. `IN_APP` is fully real; `EMAIL`/`SMS`/`PUSH` are config-gated through the existing `IntegrationConfig` (Milestone 4) but never actually send — a `NotificationDelivery` row records the attempt as `FAILED` with a reason, so nothing pretends to succeed. This is also the first real use of BullMQ (`src/queue/`) — the roadmap explicitly calls out background jobs for notifications, and the recurring announcement-expiry-reminder scan is exactly that kind of work; immediate fan-out (announcement publish, class group messages) still happens synchronously in the request, same as Webhooks' inline fetch. Class Groups (`src/modules/class-groups/`) aren't in the roadmap at all — a `Section` already *is* "the class," so there's no separate `ClassGroup` entity, just `ClassGroupMessage` rows scoped by `sectionId`; membership (who can read/post without `CLASS_GROUP_MANAGE`) is derived on read from `Student.sectionId` and `TimetableEntry.facultyId`, not a stored membership list. See `src/modules/notifications/` and `src/modules/class-groups/` plus the README's API reference for both.

**Post-Release-4: Auth completion, 360 views, Global Search, Timetable periods** (user request, not a roadmap milestone). Four additions, all read-mostly and self-contained:
- **Auth completion** — `change-password`/`forgot-password`/`reset-password` on the existing `auth` module. `PasswordResetToken` is a new table with the same `tenant_bootstrap` RLS exception as `RefreshToken`/`ApiKey` (inline from its first migration, not retrofitted) since `reset-password` only ever receives an opaque token, never a tenant id. Password delivery reuses the Notifications module's own honesty pattern: an `EMAIL` is *attempted* via `dispatchNotification` (recorded `FAILED`, no provider wired up anywhere in this codebase) and, since that attempt is the only delivery path that exists, the raw token is also returned directly in the response — but only outside production (`!env.isProduction`), the same boundary `errorHandler.ts` already draws around stack traces. Both `change-password` and `reset-password` revoke every `RefreshToken` for the user (forces re-login everywhere else; the caller's own current access token is untouched until it naturally expires, same as logout).
- **Student 360 / Faculty 360** — `GET /students/:id/360` and `GET /faculty/:id/360`, a single read-only aggregation of everything this backend already tracks about one person, for the admin dashboard's profile view. Implemented as direct Prisma queries in each module's own service file rather than by composing other modules' paginated list endpoints, since a "give me everything for this id" shape doesn't match a "give me a page of these" shape. `fees.totalOutstanding` deliberately reuses Fees' own invoice-status ledger math rather than re-deriving it, so the two surfaces never disagree.
- **Global Search** — `GET /search`, a new module (`src/modules/search/`) with no single router-level permission gate; unlike every other module, which of its seven categories (students, faculty, departments, programs, batches, sections, subjects) actually run depends on the caller's own granted permissions, checked once per request via the same `getPermissionsForRole` cache `requirePermission` uses internally. A category the caller can't read always comes back `[]`, never an omitted key.
- **Timetable period slots + visual grid** — `PeriodSlot` (`src/modules/timetable/periodSlot.service.ts`), the institution's shared daily bell schedule (Period 1, Break, Period 2, ..., Lunch), reusing the existing `TIMETABLE_*` permissions rather than new ones. Deliberately **not** linked to `TimetableEntry` by a foreign key: the frontend's new visual weekly grid (campusone-admin's `TimetableGrid`) matches an entry to the period row(s) it covers purely by `[startTime, endTime)` overlap — the exact same string-comparison overlap check `timetable.service.ts`'s own faculty/room/section conflict detection already used, now extracted to a shared `timeOverlap.ts` helper both services import. That design choice meant the entire conflict-detection code path and the `TimetableEntry` schema/API needed **zero** changes — a lab spanning three periods back-to-back is just one entry whose time range happens to cover three period rows, rendered as a merged cell client-side.

## The frontend is fully wired — no mock layer left

`campusone-admin`'s early V1 scope (auth, dashboard, departments, students) was originally built against a mock service layer to unblock frontend work before this API existed. That's gone: `src/services/mock/` was deleted once every module above had a real endpoint to call, and every one of `campusone-admin`'s ~38 `src/services/api/*Api.ts` files now talks to this API directly through a shared `httpClient.ts`. There's no mock contract left to match — this repo's own Zod schemas (and, for anything new, the roadmap doc) are the sole contract now. The paginated-response envelope (`{ data, meta: { page, pageSize, total, totalPages } }`) stays the standard for every list endpoint regardless. See `campusone-admin/CLAUDE.md` for how the frontend consumes all of this.
