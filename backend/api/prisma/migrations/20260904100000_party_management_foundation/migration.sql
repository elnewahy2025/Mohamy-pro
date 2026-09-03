-- Phase 7: Party Management Foundation
-- Additive migration for Party, PartyRole, and PartyRelationship tables.

CREATE TYPE "PartyType" AS ENUM ('PERSON', 'ORGANIZATION');

CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyType" "PartyType" NOT NULL,
    "name" TEXT,
    "legalName" TEXT,
    "displayName" TEXT NOT NULL,
    "status" "HierarchyStatus" NOT NULL DEFAULT 'ACTIVE',
    "clientId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Party" ADD CONSTRAINT "Party_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Party" ADD CONSTRAINT "Party_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Party_id_tenantId_key" ON "Party"("id", "tenantId");
CREATE INDEX "Party_tenantId_status_idx" ON "Party"("tenantId", "status");

ALTER TABLE "Party" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Party" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Party_tenant_isolation" ON "Party" USING (public.app_tenant_context_is_valid() AND "tenantId" = current_setting('app.tenant_id', true)) WITH CHECK (public.app_tenant_context_is_valid() AND "tenantId" = current_setting('app.tenant_id', true));

CREATE TABLE "PartyRole" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "HierarchyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartyRole_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PartyRole" ADD CONSTRAINT "PartyRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PartyRole_tenantId_key_key" ON "PartyRole"("tenantId", "key");

ALTER TABLE "PartyRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartyRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY "PartyRole_tenant_isolation" ON "PartyRole" USING (public.app_tenant_context_is_valid() AND "tenantId" = current_setting('app.tenant_id', true)) WITH CHECK (public.app_tenant_context_is_valid() AND "tenantId" = current_setting('app.tenant_id', true));

CREATE TABLE "PartyRelationship" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromPartyId" TEXT NOT NULL,
    "toPartyId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "status" "HierarchyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartyRelationship_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PartyRelationship" ADD CONSTRAINT "PartyRelationship_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartyRelationship" ADD CONSTRAINT "PartyRelationship_fromPartyId_fkey" FOREIGN KEY ("fromPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartyRelationship" ADD CONSTRAINT "PartyRelationship_toPartyId_fkey" FOREIGN KEY ("toPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PartyRelationship_id_tenantId_key" ON "PartyRelationship"("id", "tenantId");
CREATE INDEX "PartyRelationship_tenantId_fromPartyId_idx" ON "PartyRelationship"("tenantId", "fromPartyId");

ALTER TABLE "PartyRelationship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartyRelationship" FORCE ROW LEVEL SECURITY;
CREATE POLICY "PartyRelationship_tenant_isolation" ON "PartyRelationship" USING (public.app_tenant_context_is_valid() AND "tenantId" = current_setting('app.tenant_id', true)) WITH CHECK (public.app_tenant_context_is_valid() AND "tenantId" = current_setting('app.tenant_id', true));

-- Seed Permission
INSERT INTO "Permission" (id, key, description, "createdAt")
SELECT
  gen_random_uuid()::text,
  'CanManageParties',
  'Create, update, archive, and list parties and party relationships within the active tenant.',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" WHERE "key" = 'CanManageParties'
);

-- Seed Default PartyRoles for all existing tenants
INSERT INTO "PartyRole" ("id", "tenantId", "key", "label", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'plaintiff', 'Plaintiff', 'ACTIVE', now(), now() FROM "Tenant" t WHERE NOT EXISTS (SELECT 1 FROM "PartyRole" WHERE "tenantId" = t."id" AND "key" = 'plaintiff');

INSERT INTO "PartyRole" ("id", "tenantId", "key", "label", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'defendant', 'Defendant', 'ACTIVE', now(), now() FROM "Tenant" t WHERE NOT EXISTS (SELECT 1 FROM "PartyRole" WHERE "tenantId" = t."id" AND "key" = 'defendant');

INSERT INTO "PartyRole" ("id", "tenantId", "key", "label", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'claimant', 'Claimant', 'ACTIVE', now(), now() FROM "Tenant" t WHERE NOT EXISTS (SELECT 1 FROM "PartyRole" WHERE "tenantId" = t."id" AND "key" = 'claimant');

INSERT INTO "PartyRole" ("id", "tenantId", "key", "label", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'respondent', 'Respondent', 'ACTIVE', now(), now() FROM "Tenant" t WHERE NOT EXISTS (SELECT 1 FROM "PartyRole" WHERE "tenantId" = t."id" AND "key" = 'respondent');

INSERT INTO "PartyRole" ("id", "tenantId", "key", "label", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'witness', 'Witness', 'ACTIVE', now(), now() FROM "Tenant" t WHERE NOT EXISTS (SELECT 1 FROM "PartyRole" WHERE "tenantId" = t."id" AND "key" = 'witness');

INSERT INTO "PartyRole" ("id", "tenantId", "key", "label", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'expert', 'Expert', 'ACTIVE', now(), now() FROM "Tenant" t WHERE NOT EXISTS (SELECT 1 FROM "PartyRole" WHERE "tenantId" = t."id" AND "key" = 'expert');

INSERT INTO "PartyRole" ("id", "tenantId", "key", "label", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'company', 'Company', 'ACTIVE', now(), now() FROM "Tenant" t WHERE NOT EXISTS (SELECT 1 FROM "PartyRole" WHERE "tenantId" = t."id" AND "key" = 'company');

INSERT INTO "PartyRole" ("id", "tenantId", "key", "label", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'government', 'Government', 'ACTIVE', now(), now() FROM "Tenant" t WHERE NOT EXISTS (SELECT 1 FROM "PartyRole" WHERE "tenantId" = t."id" AND "key" = 'government');

INSERT INTO "PartyRole" ("id", "tenantId", "key", "label", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'other', 'Other', 'ACTIVE', now(), now() FROM "Tenant" t WHERE NOT EXISTS (SELECT 1 FROM "PartyRole" WHERE "tenantId" = t."id" AND "key" = 'other');
