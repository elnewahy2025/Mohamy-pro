-- Phase 2 legacy-table boundary: IdempotencyKey tenant isolation.
--
-- This migration adds a TYPED, server-derived "tenantId" foreign key column
-- (distinct from the legacy orphan column of the same name dropped in
-- 20260831130000_idempotency_drop_orphan_columns) and enforces tenant
-- isolation via FORCE ROW LEVEL SECURITY for the business-mutation
-- reservation/completion/replay path. OIDC protocol routes are excluded from
-- business idempotency and never use this table.
--
-- Scope model:
--   * app_tenant_context_is_valid()        existing full request boundary
--                                          (tenant + user + membership + operation).
--   * app_worker_tenant_context_is_valid() worker/server boundary (tenant +
--                                          operation only; no membership). The
--                                          request-bound idempotency
--                                          reservation/completion path runs
--                                          BEFORE the controller enters its
--                                          membership-validated tenant context,
--                                          so the interceptor establishes this
--                                          server-derived worker scope itself.
--   * app_actor_scope_is_valid()           a bounded actor boundary (valid user,
--                                          NO tenant / membership). It covers the
--                                          actor-only idempotency rows (tenantId
--                                          IS NULL) used by requests that have an
--                                          authenticated actor but no active tenant
--                                          (e.g. tenant-switch). It never permits
--                                          ordinary tenant data access.
--
-- The IdempotencyKey policy permits a row only when:
--   (a) the row carries a tenantId AND the caller is acting in exactly that
--       tenant under a valid request or worker scope
--       (tenantId = current_setting('app.tenant_id')), OR
--   (b) the row has NO tenant (actor-only/global idempotency) AND the caller is
--       in the actor scope (valid user, no tenant/membership).
-- There is deliberately NO permissive "tenantId IS NULL OR anything" bucket: a
-- tenant-scoped request/worker never sees another tenant's rows and never sees
-- actor-only rows; actor-only rows are reachable only through the actor scope.

-- Actor boundary: exactly one validated user + operation, no tenant/membership.
CREATE OR REPLACE FUNCTION public.app_actor_scope_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    coalesce(current_setting('app.tenant_id', true), '') = ''
    AND coalesce(current_setting('app.membership_id', true), '') = ''
    AND current_setting('app.user_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND current_setting('app.operation_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$$;

-- Add the typed server-derived tenant FK column (nullable: a key may be
-- actor-only/global). Naming matches the existing per-table tenant FK pattern.
ALTER TABLE "IdempotencyKey" ADD COLUMN "tenantId" text;
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "IdempotencyKey_tenantId_idx" ON "IdempotencyKey"("tenantId");

ALTER TABLE "IdempotencyKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdempotencyKey" FORCE ROW LEVEL SECURITY;

CREATE POLICY "IdempotencyKey_scope_isolation"
  ON "IdempotencyKey"
  USING (
    (
      "tenantId" IS NOT NULL
      AND (
        (
          public.app_tenant_context_is_valid()
          AND "tenantId" = current_setting('app.tenant_id', true)
        )
        OR (
          public.app_worker_tenant_context_is_valid()
          AND "tenantId" = current_setting('app.tenant_id', true)
        )
      )
    )
    OR (
      "tenantId" IS NULL
      AND public.app_actor_scope_is_valid()
    )
  )
  WITH CHECK (
    (
      "tenantId" IS NOT NULL
      AND (
        (
          public.app_tenant_context_is_valid()
          AND "tenantId" = current_setting('app.tenant_id', true)
        )
        OR (
          public.app_worker_tenant_context_is_valid()
          AND "tenantId" = current_setting('app.tenant_id', true)
        )
      )
    )
    OR (
      "tenantId" IS NULL
      AND public.app_actor_scope_is_valid()
    )
  );