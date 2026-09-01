-- Phase 2 legacy-table boundary: OutboxMessage tenant isolation.
--
-- This migration enables ROW LEVEL SECURITY on OutboxMessage so a request or
-- worker can only read/advance outbox rows for the tenant it is authorized to
-- act on, while the asynchronous delivery mechanism (dispatcher claim poll and
-- worker per-job processing) retains explicit, server-side scopes.
--
-- Model recap (primarily Phase 1, retained in Phase 2):
--   * A tenant-scoped event row carries a non-null tenantId.
--   * A genuinely global operational event row carries tenantId = NULL.
--
-- Scope model added here:
--   * app_tenant_context_is_valid()      existing full request boundary
--                                        (tenant + user + membership + operation).
--   * app_worker_tenant_context_is_valid()  worker computes exactly one validated
--                                        tenantId + operationId from a job payload;
--                                        it does NOT carry a membership, so this
--                                        boundary is narrower than the request one
--                                        and is implemented in this file.
--   * app_global_delivery_scope_is_valid()  the dispatcher/claim path and genuine
--                                        global operational jobs. It is a bounded
--                                        operational scope for the outbox lifecycle
--                                        only; it never grants ordinary tenant-data
--                                        access and the API worker roles receive no
--                                        BYPASSRLS.
--
-- The OutboxMessage policy permits a row only when:
--   (a) the caller is in the global delivery scope (dispatcher claiming / delivery
--       state writes; global operational jobs), OR
--   (b) the caller is a request or worker acting in exactly that row's tenant
--       (tenantId = current_setting('app.tenant_id') with the corresponding valid
--       scope).
-- There is deliberately NO permissive "tenantId IS NULL or anything" bucket: a
-- tenant request/worker never sees another tenant's rows and never sees global
-- rows; global rows are reachable only through the delivery scope.

-- Worker tenant boundary: exactly one validated tenant + operation, no membership.
CREATE OR REPLACE FUNCTION public.app_worker_tenant_context_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    coalesce(current_setting('app.membership_id', true), '') = ''
    AND coalesce(current_setting('app.user_id', true), '') = ''
    AND current_setting('app.tenant_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND current_setting('app.operation_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$$;

-- Delivery scope: the dispatcher/claim path and registered global operational
-- jobs. Explicit and bounded to the outbox lifecycle.
CREATE OR REPLACE FUNCTION public.app_global_delivery_scope_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    coalesce(current_setting('app.delivery_scope', true), '') = 'true'
    AND current_setting('app.operation_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$$;

ALTER TABLE "OutboxMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboxMessage" FORCE ROW LEVEL SECURITY;

CREATE POLICY "OutboxMessage_scope_isolation"
  ON "OutboxMessage"
  USING (
    public.app_global_delivery_scope_is_valid()
    OR (
      public.app_tenant_context_is_valid()
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
    OR (
      public.app_worker_tenant_context_is_valid()
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    public.app_global_delivery_scope_is_valid()
    OR (
      public.app_tenant_context_is_valid()
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
    OR (
      public.app_worker_tenant_context_is_valid()
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
  );
