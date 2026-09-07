# CampusOne API — Project Context for Claude Code

## What this is

The backend for **CampusOne**, a multi-tenant SaaS college management platform. Any college signs up as a tenant; features are enabled per tenant like installable modules.

**Two separate repos, not a monorepo:** this repo is the API. The frontend lives in a sibling repo, `campusone-admin` — see its `CLAUDE.md` for the full product context, module list, competitive positioning, and frontend structure. They're paired over HTTP/CORS with no shared package; types are duplicated by hand on each side for now.

## Tech stack (decided)

- **Backend:** Express 5 + TypeScript
- **ORM/DB:** Prisma + PostgreSQL
- **Auth:** JWT access token + opaque refresh token (httpOnly cookie)
- **Validation:** Zod
- **Background jobs:** BullMQ/Redis (Redis runs via docker-compose already; no queue/processor exists until a module actually needs one — don't add one speculatively)
- **Payments (later):** Razorpay or Cashfree (native UPI — non-negotiable for India)
- **Notifications (later):** WhatsApp Business API + SMS/email fallback (e.g. Gupshup)

## Multi-tenancy — the most important architectural decision

- Pooled: one Postgres database, one schema, every table carries a `tenantId` column.
- Enforce isolation with **Postgres Row-Level Security** — never rely on app-level `WHERE tenantId = ...` as the only guard. RLS is the last line of defense.
- Prisma middleware (`$use`) is removed in Prisma 7 — use a **Prisma Client Extension** that runs `SET_CONFIG('app.current_tenant', ...)` at the start of each request/transaction, paired with an RLS policy on every tenant-scoped table.
- Carry `tenantId` (and the authenticated user/role) through the request lifecycle via `AsyncLocalStorage`, set once in middleware right after auth verification — not threaded as a parameter through every function, that's how it gets forgotten and a cross-tenant leak slips through.
- Never let a query reach a service/route handler without a resolved `tenantId` in context. A resolved tenant is a precondition, not something each handler re-checks.
- Migration path for large customers later: schema-per-tenant, then dedicated DB per tenant — don't build these now, just don't make pooled-only assumptions (e.g. hardcoded cross-tenant joins) that would block the upgrade.

## Module system

- Platform core (always on) + installable modules. A `tenant_modules` table maps `tenantId → moduleId → enabled + planTier`.
- Every API route checks module entitlement before executing, mirroring the frontend's route-level checks — a disabled module must 403, not just hide the UI button.
- Module list and roles are documented in the frontend's `CLAUDE.md` (`SUPER_ADMIN`/`COLLEGE_ADMIN` → `DEPARTMENT_ADMIN` → `FACULTY`/`STAFF` → `STUDENT`, all scoped per tenant except `PLATFORM_ADMIN`). Every permission check is "does user X have role Y inside tenant Z" — never just "does this user have role Y."

## Development sequencing

1. Tenant model + auth/RBAC + module-entitlement system before deep-building any single module's endpoints.
2. Departments + Students CRUD to match the frontend's V1 scope (list/add/edit/details), matching the shapes already defined in the frontend's `src/types` and mock `src/services/api`.
3. Then: Academics → Fee/Finance (UPI) → Communication engine → Library/Hostel/Transport → HR/Payroll/Examination/Placement-Alumni → Compliance/Reporting.

## Matching the frontend's mock contract

The frontend was built against a mock service layer (`campusone-admin/src/services/api`) before this backend existed. When implementing an endpoint, check the corresponding mock function's request/response shape (e.g. `studentsApi.ts`, `departmentsApi.ts`) and the paginated-response envelope (`{ data, meta: { page, pageSize, total, totalPages } }`) — matching it exactly means the frontend's service layer only needs its `fetch` implementation swapped in, no consuming code changes.
