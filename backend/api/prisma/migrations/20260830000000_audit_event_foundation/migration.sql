-- Phase 2 audit-event foundation (additive).
--
-- Adds the append-only AuditEvent store for authentication, membership,
-- authorization, denial, tenant-switch, and privileged events. The event is
-- written in the same transaction as the state change it records; it is never
-- updated or deleted by the application runtime roles. Append-only enforcement
-- is provided by revoking UPDATE/DELETE from the runtime role and by a trigger
-- that rejects mutation of immutable event fields. Retention is enforced on the
-- row via `retentionUntil` (at least seven years at write time).
--
-- No table or enum created by an earlier migration is altered or dropped.

-- Event category and outcome enums.
CREATE TYPE "AuditCategory" AS ENUM ('AUDIT', 'SECURITY');
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCEEDED', 'DENIED', 'FAILED', 'REVOKED');

-- The append-only audit/security event store.
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL,
    "category" "AuditCategory" NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "actorUserId" TEXT,
    "actorMembershipId" TEXT,
    "tenantId" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "policy" TEXT,
    "reasonCode" TEXT,
    "correlationId" TEXT NOT NULL,
    "traceId" TEXT,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retentionUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- Indexes required for tenant-scoped queries, actor history, correlation
-- correlation-id replay/dedup, and retention purge.
CREATE INDEX "AuditEvent_tenantId_eventType_occurredAt_idx"
    ON "AuditEvent"("tenantId", "eventType", "occurredAt");
CREATE INDEX "AuditEvent_actorUserId_occurredAt_idx"
    ON "AuditEvent"("actorUserId", "occurredAt");
CREATE INDEX "AuditEvent_correlationId_idx"
    ON "AuditEvent"("correlationId");
CREATE INDEX "AuditEvent_retentionUntil_idx"
    ON "AuditEvent"("retentionUntil");

-- Foreign keys (tenant-consistent where composite).
ALTER TABLE "AuditEvent"
    ADD CONSTRAINT "AuditEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditEvent"
    ADD CONSTRAINT "AuditEvent_actorMembershipId_tenantId_fkey"
    FOREIGN KEY ("actorMembershipId", "tenantId")
    REFERENCES "Membership"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditEvent"
    ADD CONSTRAINT "AuditEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only enforcement: the application runtime role may insert audit rows
-- (through its normal grants) and may read through RLS, but must not update or
-- delete persisted events. The REVOKE below is defensive for non-owner roles;
-- the reject-immutable-mutation trigger below enforces immutability for all
-- roles including the current owner/developer role, so an accidental UPDATE or
-- DELETE of an immutable field fails closed.
REVOKE UPDATE, DELETE ON "AuditEvent" FROM PUBLIC;

-- Reject any attempt to update or delete a persisted audit/security event.
-- Legal-hold/retention purge is a separately authorized, audited operation and
-- is intentionally NOT performed through this table's normal UPDATE/DELETE path.
CREATE OR REPLACE FUNCTION public.app_audit_event_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RAISE EXCEPTION 'AuditEvent is append-only; UPDATE or DELETE is not permitted';
END;
$$;

DROP TRIGGER IF EXISTS "AuditEvent_append_only" ON "AuditEvent";
CREATE TRIGGER "AuditEvent_append_only"
    BEFORE UPDATE OR DELETE ON "AuditEvent"
    FOR EACH ROW
    EXECUTE FUNCTION public.app_audit_event_reject_mutation();

-- Global-scope audit context: permits a globally-scoped (non-tenant) event,
-- e.g. an unauthenticated or provider-boundary authentication event, to be
-- written and read only when an operation context is present and no tenant or
-- membership scope is set. Mirrors the membership-selection boundary but does
-- not require a user identity, so pre-authentication provider events can be
-- recorded.
CREATE OR REPLACE FUNCTION public.app_audit_global_scope_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    coalesce(current_setting('app.tenant_id', true), '') = ''
    AND coalesce(current_setting('app.membership_id', true), '') = ''
    AND current_setting('app.operation_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$$;

ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;

-- Tenant-scoped audit events are visible only inside their server-selected
-- tenant, matching the Phase 2 tenant-isolation boundary.
CREATE POLICY "AuditEvent_tenant_isolation"
    ON "AuditEvent"
    USING (
        public.app_tenant_context_is_valid()
        AND "tenantId" = current_setting('app.tenant_id', true)
    )
    WITH CHECK (
        public.app_tenant_context_is_valid()
        AND "tenantId" = current_setting('app.tenant_id', true)
    );

-- Global-scope audit events (tenantId IS NULL) require a valid global
-- operation context and no tenant/membership scope.
CREATE POLICY "AuditEvent_global_scope"
    ON "AuditEvent"
    USING (
        "tenantId" IS NULL
        AND public.app_audit_global_scope_is_valid()
    )
    WITH CHECK (
        "tenantId" IS NULL
        AND public.app_audit_global_scope_is_valid()
    );
