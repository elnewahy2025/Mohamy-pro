-- Phase 2 append-only audit-event foundation.
-- Additive only: no existing table or row is dropped, truncated, or rewritten.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'AuditCategory'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "AuditCategory" AS ENUM ('AUDIT', 'SECURITY');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'AuditOutcome'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "AuditOutcome" AS ENUM ('SUCCEEDED', 'DENIED', 'FAILED', 'REVOKED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id" TEXT NOT NULL,
  "eventType" VARCHAR(128) NOT NULL,
  "eventVersion" INTEGER NOT NULL DEFAULT 1,
  "category" "AuditCategory" NOT NULL,
  "outcome" "AuditOutcome" NOT NULL,
  "actorUserId" TEXT,
  "actorMembershipId" TEXT,
  "tenantId" TEXT,
  "targetType" VARCHAR(128),
  "targetId" VARCHAR(128),
  "policy" VARCHAR(128),
  "reasonCode" VARCHAR(128),
  "correlationId" VARCHAR(36) NOT NULL,
  "traceId" VARCHAR(128),
  "ipHash" VARCHAR(128),
  "userAgentHash" VARCHAR(128),
  "metadata" JSONB NOT NULL,
  "payloadHash" VARCHAR(64) NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retentionUntil" TIMESTAMP(3) NOT NULL,
  "legalHold" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditEvent_eventVersion_check" CHECK ("eventVersion" > 0),
  CONSTRAINT "AuditEvent_eventType_check" CHECK ("eventType" ~ '^[a-z][a-z0-9]*(\.[a-z0-9_]+)+$'),
  CONSTRAINT "AuditEvent_correlationId_check" CHECK ("correlationId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT "AuditEvent_payloadHash_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "AuditEvent_metadata_size_check" CHECK (pg_column_size("metadata") <= 65536),
  CONSTRAINT "AuditEvent_retention_check" CHECK ("retentionUntil" >= "occurredAt" + INTERVAL '7 years'),
  CONSTRAINT "AuditEvent_membership_scope_check" CHECK ("actorMembershipId" IS NULL OR "tenantId" IS NOT NULL),
  CONSTRAINT "AuditEvent_target_pair_check" CHECK ("targetType" IS NULL OR "targetId" IS NOT NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AuditEvent_actorUserId_fkey'
      AND conrelid = 'public."AuditEvent"'::regclass
  ) THEN
    ALTER TABLE "AuditEvent"
      ADD CONSTRAINT "AuditEvent_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AuditEvent_tenantId_fkey'
      AND conrelid = 'public."AuditEvent"'::regclass
  ) THEN
    ALTER TABLE "AuditEvent"
      ADD CONSTRAINT "AuditEvent_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AuditEvent_actorMembershipId_tenantId_fkey'
      AND conrelid = 'public."AuditEvent"'::regclass
  ) THEN
    ALTER TABLE "AuditEvent"
      ADD CONSTRAINT "AuditEvent_actorMembershipId_tenantId_fkey"
      FOREIGN KEY ("actorMembershipId", "tenantId")
      REFERENCES "Membership"("id", "tenantId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AuditEvent_tenantId_occurredAt_idx"
  ON "AuditEvent"("tenantId", "occurredAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_actorUserId_occurredAt_idx"
  ON "AuditEvent"("actorUserId", "occurredAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_eventType_occurredAt_idx"
  ON "AuditEvent"("eventType", "occurredAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_retentionUntil_legalHold_idx"
  ON "AuditEvent"("retentionUntil", "legalHold");

CREATE OR REPLACE FUNCTION public.prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('app.audit_retention_purge', true) = 'true'
     AND OLD."legalHold" = false
     AND OLD."retentionUntil" <= CURRENT_TIMESTAMP THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AuditEvent is append-only';
END;
$$;

DROP TRIGGER IF EXISTS "AuditEvent_append_only" ON "AuditEvent";
CREATE TRIGGER "AuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_event_mutation();

REVOKE UPDATE, DELETE ON TABLE "AuditEvent" FROM PUBLIC;

ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AuditEvent_global_control_insert" ON "AuditEvent";
CREATE POLICY "AuditEvent_global_control_insert"
  ON "AuditEvent"
  FOR INSERT
  WITH CHECK (current_setting('app.global_operation', true) = 'true');
DROP POLICY IF EXISTS "AuditEvent_tenant_insert" ON "AuditEvent";
CREATE POLICY "AuditEvent_tenant_insert"
  ON "AuditEvent"
  FOR INSERT
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
DROP POLICY IF EXISTS "AuditEvent_retention_delete" ON "AuditEvent";
CREATE POLICY "AuditEvent_retention_delete"
  ON "AuditEvent"
  FOR DELETE
  USING (
    current_setting('app.audit_retention_purge', true) = 'true'
    AND "legalHold" = false
    AND "retentionUntil" <= CURRENT_TIMESTAMP
  );
DROP POLICY IF EXISTS "AuditEvent_global_control_select" ON "AuditEvent";
CREATE POLICY "AuditEvent_global_control_select"
  ON "AuditEvent"
  FOR SELECT
  USING (
    current_setting('app.audit_retention_purge', true) = 'true'
    OR current_setting('app.outbox_dispatcher', true) = 'true'
  );
DROP POLICY IF EXISTS "AuditEvent_tenant_select" ON "AuditEvent";
CREATE POLICY "AuditEvent_tenant_select"
  ON "AuditEvent"
  FOR SELECT
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
