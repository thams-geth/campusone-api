# CampusOne API

Backend API for **CampusOne**, a multi-tenant SaaS college management platform. Paired with the [`campusone-admin`](../campusone-admin) frontend.

## Stack

- Express 5 + TypeScript
- Prisma + PostgreSQL
- JWT access + refresh token auth
- Zod for request validation
- Redis (via Docker Compose) reserved for future background jobs (BullMQ) — not wired up yet, no job queue exists until a module actually needs one
- Vitest + Supertest for tests

## Getting started

```bash
cp .env.example .env        # then fill in real secrets
docker compose up -d        # Postgres + Redis (also creates the app_role — see Multi-tenancy below)
npm install
npm run prisma:migrate      # applies the schema + RLS policies
npm run prisma:seed         # once a seed script exists
npm run dev
```

The API listens on `http://localhost:4000` by default; `GET /health` is a liveness check.

### Auth endpoints

| Route | Auth | Notes |
|---|---|---|
| `POST /api/auth/login` | none | `{ email, password }` → `{ user, token }` + sets an httpOnly refresh cookie |
| `POST /api/auth/refresh` | refresh cookie | rotates the refresh token, returns a new `{ token }` |
| `POST /api/auth/logout` | refresh cookie | revokes the refresh token, clears the cookie |
| `GET /api/auth/me` | `Authorization: Bearer <token>` | returns the current user |

`login`/`refresh` sit behind a stricter rate limit than the rest of the API (see `auth.routes.ts`).

### Departments endpoints

All require `Authorization: Bearer <token>` and one of `SUPER_ADMIN`/`COLLEGE_ADMIN`/`DEPARTMENT_ADMIN` — matching the frontend's route-level gate on the whole section, not just the mutating routes.

| Route | Notes |
|---|---|
| `GET /api/departments` | paginated (`page`, `pageSize`), `search`, `status` query params |
| `GET /api/departments/:id` | 404s for another tenant's department (RLS, not an app-level check) |
| `POST /api/departments` | 409 `DUPLICATE_CODE` on a repeated code |
| `PUT /api/departments/:id` | same duplicate-code check, excluding itself |
| `DELETE /api/departments/:id` | 409 `DEPARTMENT_IN_USE` if it still has students |

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
npm run prisma:studio   # browse the DB
```

## Project structure

```
src/
├── config/       # env validation, logger
├── middleware/   # error handling, auth, tenant context
├── modules/      # one folder per feature (auth, departments, students, ...)
├── prisma/       # Prisma client + extension, tenant context (AsyncLocalStorage)
├── utils/        # ApiError and other shared helpers
├── app.ts        # Express app wiring (middleware, routes)
└── server.ts     # process entry point
prisma/
├── schema.prisma
├── migrations/
└── seed.ts       # once it exists
docker/
└── init-app-role.sql  # creates the non-superuser role the API runs as
```

## Multi-tenancy

Pooled database, one schema, every table carries a `tenantId` column, enforced with Postgres Row-Level Security as the last line of defense — not just application-level `WHERE tenantId = ...` clauses. See `CLAUDE.md` for the full architecture rationale.

**Two Postgres roles, on purpose:** `campusone` (from `POSTGRES_USER`) is a Postgres *superuser* — that's how the official postgres image works — and Postgres superusers bypass Row-Level Security unconditionally, even with `FORCE ROW LEVEL SECURITY`. Migrations run as `campusone` (`DATABASE_URL`), but the running API connects as `campusone_app` (`APP_DATABASE_URL`), a plain non-superuser role created by `docker/init-app-role.sql`, which is what actually makes the RLS policies enforce anything. This isn't hypothetical — the first version of this setup used one role for everything, and `src/prisma/client.test.ts`'s RLS tests caught it immediately (every "isolation" test passed even with the policies doing nothing, because they ran as the superuser). If you ever see all-tenants-visible behavior, check which role the connection is using before anything else.

Tenant context flows: JWT → auth middleware sets `requestContext` (`AsyncLocalStorage`, `src/prisma/tenantContext.ts`) → the Prisma client extension (`src/prisma/client.ts`) reads it and runs `SET LOCAL app.current_tenant` in the same transaction as every query. One narrow, documented exception: login looks up a user by email before the tenant is known (email is globally unique so one login form can resolve it) — see `findUserByEmailForLogin` and the RLS policy comment on the `User` table.

## Security notes

- Passwords are hashed with bcrypt (12 rounds); plaintext passwords never touch the database or logs (see the logger's redaction config).
- Access tokens are JWTs; refresh tokens are opaque random values, stored as a SHA-256 hash (not the raw token), and delivered as an httpOnly cookie — never exposed to JS. Refresh tokens rotate on every use (the presented one is revoked and a new one issued); reusing an already-rotated token is rejected.
- Accounts lock for 30s after 5 consecutive failed logins (tracked server-side on the `User` row, not just client-side UX).
- All request bodies are validated with Zod before touching business logic; validation failures never reach the database layer.
- CORS is locked to the configured frontend origin(s); `credentials: true` is required for the refresh-token cookie to work cross-origin in dev.
- Rate limiting is applied globally, with a stricter limit on auth endpoints (login/refresh) to slow down credential-stuffing attempts. This is defense-in-depth, not a substitute for a proper WAF/edge rate limiter in production.
- `npm audit`: as of this writing, `prisma`'s CLI has unresolved advisories in its bundled MySQL driver and config-merging dependency (mysql2, deepmerge-ts) — these affect Prisma's dev-time CLI tooling, not the `@prisma/client` runtime library actually used by the running API, and we only use the Postgres driver. Re-check on each dependency bump.
