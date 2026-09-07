-- Runs automatically once, the first time the postgres container
-- initializes a fresh data volume (docker-entrypoint-initdb.d
-- convention). Not re-run on an existing volume — if you already had
-- the postgres container running before this file existed, apply it
-- by hand once: `docker compose exec -T postgres psql -U campusone -d
-- campusone < docker/init-app-role.sql`.
--
-- Why this role exists: POSTGRES_USER (campusone) is created as a
-- Postgres SUPERUSER by the official postgres image. Superusers bypass
-- Row-Level Security unconditionally — FORCE ROW LEVEL SECURITY only
-- affects table owners, not superusers. So the running API must never
-- connect as campusone; it connects as this plain role instead, which
-- is what actually makes the RLS policies in the initial migration
-- mean anything. Dev-only password, consistent with docker-compose.yml
-- — never reuse this in a real deployment.

CREATE ROLE campusone_app WITH LOGIN PASSWORD 'campusone_app_dev_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA public TO campusone_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO campusone_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO campusone_app;

-- Tables created later by migrations (as the superuser) still need to
-- grant this role access — default privileges apply automatically to
-- anything created afterward, so this isn't a one-time snapshot.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campusone_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO campusone_app;
