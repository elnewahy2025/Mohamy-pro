-- Phase 6: Conflict Check Foundation. Tenant-scoped ConflictCheck + ConflictParty
-- tables supporting a request-to-decision workflow (Requester, Client, Parties /
-- Related Entities, Reviewer, Decision, Reason, Audit) and the acceptance-gate
-- decision contract that a future Matter/Case acceptance flow (Phase 7/8) invokes.
-- This is an additive migration: two new tenant-scoped tables, no destructive
-- change to existing data.
--
-- Column types FOLLOW the established codebase convention: string (TEXT) ids and
-- tenant FKs, matching the Tenant / Organization / Branch / Client tables.

CREATE TABLE "ConflictCheck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requesterUserId" TEXT NOT NULL,
    "clientId" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "reviewerUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "matchSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConflictCheck_pkey" PRIMARY KEY ("id")
);

-- Add FKs to Tenant and Client (TEXT id, matching convention).
ALTER TABLE "ConflictCheck"
  ADD CONSTRAINT "ConflictCheck_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConflictCheck"
  ADD CONSTRAINT "ConflictCheck_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ConflictCheck_id_tenantId_key"
  ON "ConflictCheck"("id", "tenantId");
CREATE INDEX "ConflictCheck_tenantId_status_idx"
  ON "ConflictCheck"("tenantId", "status");

-- RLS: identical tenant-isolation policy to the other tenant tables.
ALTER TABLE "ConflictCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConflictCheck" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ConflictCheck_tenant_isolation"
  ON "ConflictCheck"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE TABLE "ConflictParty" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conflictCheckId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConflictParty_pkey" PRIMARY KEY ("id")
);

-- Add FKs to ConflictCheck and Tenant (TEXT id, matching convention).
ALTER TABLE "ConflictParty"
  ADD CONSTRAINT "ConflictParty_conflictCheckId_fkey"
  FOREIGN KEY ("conflictCheckId") REFERENCES "ConflictCheck"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConflictParty"
  ADD CONSTRAINT "ConflictParty_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ConflictParty_id_tenantId_key"
  ON "ConflictParty"("id", "tenantId");
CREATE INDEX "ConflictParty_tenantId_conflictCheckId_idx"
  ON "ConflictParty"("tenantId", "conflictCheckId");

-- RLS: identical tenant-isolation policy to the other tenant tables.
ALTER TABLE "ConflictParty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConflictParty" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ConflictParty_tenant_isolation"
  ON "ConflictParty"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- The CanManageConflictChecks named policy for the Phase 6 conflict check
-- workflow and acceptance-gate contractor. Unknown/unwired catalog keys are
-- created at runtime by PermissionsService.ensurePermissionId and wired by
-- reconcileBuiltInRoles; this seed makes the catalog row explicit and
-- idempotent, matching the existing migrations. Permission is not RLS-enforced.
INSERT INTO "Permission" (id, key, description, "createdAt")
SELECT
  gen_random_uuid()::text,
  'CanManageConflictChecks',
  'Request, review, and decide conflict checks within the active tenant.',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" WHERE "key" = 'CanManageConflictChecks'
);