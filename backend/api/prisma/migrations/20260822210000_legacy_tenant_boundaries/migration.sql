-- Phase 2 legacy tenant-boundary continuation.
-- This migration is additive with respect to row data. Existing outbox rows
-- remain GLOBAL and existing idempotency rows are retained as completed
-- legacy records with a non-replayable legacy scope. No table or row data is
-- dropped, truncated, or reset.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OutboxScope' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "OutboxScope" AS ENUM ('GLOBAL', 'TENANT');
  ELSIF (
    SELECT array_agg(enumlabel ORDER BY enumsortorder)
    FROM pg_enum
    WHERE enumtypid = 'public."OutboxScope"'::regtype
  ) IS DISTINCT FROM ARRAY['GLOBAL', 'TENANT']::text[] THEN
    RAISE EXCEPTION 'Existing public.OutboxScope enum has incompatible labels';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IdempotencyState' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "IdempotencyState" AS ENUM ('RESERVED', 'COMPLETED', 'TERMINAL_FAILURE', 'RETRYABLE');
  ELSIF (
    SELECT array_agg(enumlabel ORDER BY enumsortorder)
    FROM pg_enum
    WHERE enumtypid = 'public."IdempotencyState"'::regtype
  ) IS DISTINCT FROM ARRAY['RESERVED', 'COMPLETED', 'TERMINAL_FAILURE', 'RETRYABLE']::text[] THEN
    RAISE EXCEPTION 'Existing public.IdempotencyState enum has incompatible labels';
  END IF;
END $$;

ALTER TABLE "OutboxMessage"
  ADD COLUMN "scope" "OutboxScope" NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN "eventVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "traceparent" TEXT,
  ADD COLUMN "contextUserId" TEXT,
  ADD COLUMN "contextMembershipId" TEXT,
  ADD COLUMN "operationId" TEXT;

ALTER TABLE "OutboxMessage"
  ADD CONSTRAINT "OutboxMessage_scope_consistency_check"
  CHECK (
    ("scope" = 'GLOBAL' AND "tenantId" IS NULL AND "contextUserId" IS NULL AND "contextMembershipId" IS NULL AND "operationId" IS NULL)
    OR
    ("scope" = 'TENANT' AND "tenantId" IS NOT NULL AND "contextUserId" IS NOT NULL AND "contextMembershipId" IS NOT NULL AND "operationId" IS NOT NULL)
  );

CREATE INDEX "OutboxMessage_scope_tenantId_status_availableAt_idx"
  ON "OutboxMessage"("scope", "tenantId", "status", "availableAt");

ALTER TABLE "IdempotencyKey"
  ADD COLUMN "id" TEXT,
  ADD COLUMN "actorScope" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "tenantScope" TEXT NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN "httpMethod" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "requestFingerprint" VARCHAR(64),
  ADD COLUMN "state" "IdempotencyState" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "responseHeaders" JSONB,
  ADD COLUMN "reservationLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "reservationVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "IdempotencyKey"
SET
  "id" = md5('mohamy-idempotency-record:' || "key"),
  "actorScope" = COALESCE("userId", 'LEGACY'),
  "tenantScope" = COALESCE("tenantId", 'GLOBAL'),
  "httpMethod" = 'LEGACY',
  "requestFingerprint" = md5('mohamy-idempotency-legacy-fingerprint:' || "key"),
  "state" = 'COMPLETED'
WHERE "id" IS NULL;

ALTER TABLE "IdempotencyKey"
  ALTER COLUMN "id" SET NOT NULL,
  ALTER COLUMN "requestFingerprint" SET NOT NULL,
  ALTER COLUMN "responseStatus" DROP NOT NULL,
  ALTER COLUMN "responseBody" DROP NOT NULL;

ALTER TABLE "IdempotencyKey"
  DROP CONSTRAINT "IdempotencyKey_pkey",
  ADD CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id");

ALTER TABLE "IdempotencyKey"
  ADD CONSTRAINT "IdempotencyKey_scope_consistency_check"
  CHECK (
    ("tenantScope" = 'GLOBAL' AND "tenantId" IS NULL)
    OR
    ("tenantScope" <> 'GLOBAL' AND "tenantId" IS NOT NULL AND "tenantScope" = "tenantId")
  ),
  ADD CONSTRAINT "IdempotencyKey_completion_consistency_check"
  CHECK (
    "state" NOT IN ('COMPLETED', 'TERMINAL_FAILURE')
    OR ("responseStatus" IS NOT NULL AND "responseBody" IS NOT NULL)
  );

CREATE UNIQUE INDEX "IdempotencyKey_key_key" ON "IdempotencyKey"("key");
CREATE INDEX "IdempotencyKey_scope_key"
  ON "IdempotencyKey"("key", "actorScope", "tenantScope", "httpMethod", "requestPath");
CREATE INDEX "IdempotencyKey_tenantScope_actorScope_expiresAt_idx"
  ON "IdempotencyKey"("tenantScope", "actorScope", "expiresAt");

-- Shared worker/maintenance predicates are explicit and fail closed. The
-- application role must not receive BYPASSRLS.
CREATE OR REPLACE FUNCTION public.app_outbox_dispatch_context_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    current_setting('app.outbox_dispatcher', true) = 'true'
    AND current_setting('app.operation_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$$;

CREATE OR REPLACE FUNCTION public.app_global_operation_context_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    current_setting('app.global_operation', true) = 'true'
    AND current_setting('app.operation_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$$;

CREATE OR REPLACE FUNCTION public.app_idempotency_maintenance_context_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    current_setting('app.idempotency_maintenance', true) = 'true'
    AND current_setting('app.operation_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$$;

-- Storage metadata becomes visible only through a valid tenant context.
ALTER TABLE "StorageObject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StorageObject" FORCE ROW LEVEL SECURITY;
CREATE POLICY "StorageObject_tenant_isolation"
  ON "StorageObject"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- Outbox rows can be written in the same tenant/global transaction as the
-- mutation, claimed by the named dispatcher path, and delivered in the
-- validated tenant/global context. Dispatcher access is read/update only.
ALTER TABLE "OutboxMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboxMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "OutboxMessage_context_insert"
  ON "OutboxMessage"
  FOR INSERT
  WITH CHECK (
    ("scope" = 'TENANT'
      AND public.app_tenant_context_is_valid()
      AND "tenantId" = current_setting('app.tenant_id', true)
      AND "contextUserId" = current_setting('app.user_id', true)
      AND "contextMembershipId" = current_setting('app.membership_id', true)
      AND "operationId" = current_setting('app.operation_id', true))
    OR
    ("scope" = 'GLOBAL' AND public.app_global_operation_context_is_valid())
  );
CREATE POLICY "OutboxMessage_context_read"
  ON "OutboxMessage"
  FOR SELECT
  USING (
    public.app_outbox_dispatch_context_is_valid()
    OR
    ("scope" = 'TENANT'
      AND public.app_tenant_context_is_valid()
      AND "tenantId" = current_setting('app.tenant_id', true))
    OR
    ("scope" = 'GLOBAL' AND public.app_global_operation_context_is_valid())
  );
CREATE POLICY "OutboxMessage_context_update"
  ON "OutboxMessage"
  FOR UPDATE
  USING (
    public.app_outbox_dispatch_context_is_valid()
    OR
    ("scope" = 'TENANT'
      AND public.app_tenant_context_is_valid()
      AND "tenantId" = current_setting('app.tenant_id', true))
    OR
    ("scope" = 'GLOBAL' AND public.app_global_operation_context_is_valid())
  )
  WITH CHECK (
    public.app_outbox_dispatch_context_is_valid()
    OR
    ("scope" = 'TENANT'
      AND public.app_tenant_context_is_valid()
      AND "tenantId" = current_setting('app.tenant_id', true))
    OR
    ("scope" = 'GLOBAL' AND public.app_global_operation_context_is_valid())
  );
CREATE POLICY "OutboxMessage_context_delete"
  ON "OutboxMessage"
  FOR DELETE
  USING (public.app_outbox_dispatch_context_is_valid());

-- Idempotency rows are actor and tenant scoped. Maintenance deletion is a
-- separate named path; ordinary application transactions cannot purge rows.
ALTER TABLE "IdempotencyKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdempotencyKey" FORCE ROW LEVEL SECURITY;
CREATE POLICY "IdempotencyKey_tenant_actor_select"
  ON "IdempotencyKey"
  FOR SELECT
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantScope" = current_setting('app.tenant_id', true)
    AND "tenantId" = current_setting('app.tenant_id', true)
    AND "actorScope" = current_setting('app.user_id', true)
  );
CREATE POLICY "IdempotencyKey_tenant_actor_insert"
  ON "IdempotencyKey"
  FOR INSERT
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantScope" = current_setting('app.tenant_id', true)
    AND "tenantId" = current_setting('app.tenant_id', true)
    AND "actorScope" = current_setting('app.user_id', true)
  );
CREATE POLICY "IdempotencyKey_tenant_actor_update"
  ON "IdempotencyKey"
  FOR UPDATE
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantScope" = current_setting('app.tenant_id', true)
    AND "tenantId" = current_setting('app.tenant_id', true)
    AND "actorScope" = current_setting('app.user_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantScope" = current_setting('app.tenant_id', true)
    AND "tenantId" = current_setting('app.tenant_id', true)
    AND "actorScope" = current_setting('app.user_id', true)
  );
CREATE POLICY "IdempotencyKey_global_operation_select"
  ON "IdempotencyKey"
  FOR SELECT
  USING (
    public.app_global_operation_context_is_valid()
    AND "tenantScope" = 'GLOBAL'
  );
CREATE POLICY "IdempotencyKey_global_operation_insert"
  ON "IdempotencyKey"
  FOR INSERT
  WITH CHECK (
    public.app_global_operation_context_is_valid()
    AND "tenantScope" = 'GLOBAL'
  );
CREATE POLICY "IdempotencyKey_global_operation_update"
  ON "IdempotencyKey"
  FOR UPDATE
  USING (
    public.app_global_operation_context_is_valid()
    AND "tenantScope" = 'GLOBAL'
  )
  WITH CHECK (
    public.app_global_operation_context_is_valid()
    AND "tenantScope" = 'GLOBAL'
  );
CREATE POLICY "IdempotencyKey_maintenance_delete"
  ON "IdempotencyKey"
  FOR DELETE
  USING (public.app_idempotency_maintenance_context_is_valid());

-- No permissive tenantId IS NULL policy is present. Existing legacy rows are
-- preserved but are inaccessible to ordinary tenant-scoped operations until
-- an explicitly authorized migration maps them to a tenant.

COMMENT ON TABLE "StorageObject" IS 'Tenant-scoped storage metadata; RLS requires server-derived tenant context.';
COMMENT ON TABLE "OutboxMessage" IS 'Global or tenant-scoped transactional outbox; worker scope is validated before delivery.';
COMMENT ON TABLE "IdempotencyKey" IS 'Actor/tenant-scoped idempotency state; legacy rows are retained but not replayable.';
