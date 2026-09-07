-- Extends the same narrow bootstrap exception documented on the User
-- table's policy to RefreshToken: the refresh and logout flows must
-- look up a token by its hash before a tenant is known (the client
-- only presents an opaque refresh token, not a tenant id) — see
-- findRefreshTokenByHash in src/prisma/client.ts. Same guarantee as
-- before: forgetting app.current_tenant elsewhere still fails closed;
-- this only widens the one already-documented sentinel.
ALTER POLICY tenant_isolation ON "RefreshToken"
  USING (
    "tenantId" = current_setting('app.current_tenant', true)
    OR current_setting('app.tenant_bootstrap', true) = 'true'
  );
