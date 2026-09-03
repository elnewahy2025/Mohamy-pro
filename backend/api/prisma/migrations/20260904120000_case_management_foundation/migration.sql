-- Phase 8: Matter / Case Management Foundation
-- Additive migration for Case and CaseParty tables.

CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'CLOSED', 'ON_HOLD');
CREATE TYPE "CasePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "internalNumber" TEXT,
    "clientId" TEXT NOT NULL,
    "practiceArea" TEXT,
    "caseType" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "CasePriority" NOT NULL DEFAULT 'NORMAL',
    "openDate" TIMESTAMP(3),
    "closeDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Case" ADD CONSTRAINT "Case_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Case" ADD CONSTRAINT "Case_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Case_tenantId_caseNumber_key" ON "Case"("tenantId", "caseNumber");
CREATE INDEX "Case_tenantId_status_idx" ON "Case"("tenantId", "status");

ALTER TABLE "Case" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Case" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Case_tenant_isolation" ON "Case" USING (public.app_tenant_context_is_valid() AND "tenantId" = current_setting('app.tenant_id', true)) WITH CHECK (public.app_tenant_context_is_valid() AND "tenantId" = current_setting('app.tenant_id', true));

CREATE TABLE "CaseParty" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "HierarchyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseParty_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CaseParty" ADD CONSTRAINT "CaseParty_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CaseParty" ADD CONSTRAINT "CaseParty_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseParty" ADD CONSTRAINT "CaseParty_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CaseParty" ADD CONSTRAINT "CaseParty_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "PartyRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CaseParty_tenantId_caseId_partyId_roleId_key" ON "CaseParty"("tenantId", "caseId", "partyId", "roleId");
CREATE INDEX "CaseParty_tenantId_caseId_idx" ON "CaseParty"("tenantId", "caseId");
CREATE INDEX "CaseParty_tenantId_partyId_idx" ON "CaseParty"("tenantId", "partyId");

ALTER TABLE "CaseParty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CaseParty" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CaseParty_tenant_isolation" ON "CaseParty" USING (public.app_tenant_context_is_valid() AND "tenantId" = current_setting('app.tenant_id', true)) WITH CHECK (public.app_tenant_context_is_valid() AND "tenantId" = current_setting('app.tenant_id', true));

-- Seed Permission
INSERT INTO "Permission" (id, key, description, "createdAt")
SELECT
  gen_random_uuid()::text,
  'CanManageCases',
  'Create, update, and list cases (matters) and link parties within the active tenant.',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" WHERE "key" = 'CanManageCases'
);
