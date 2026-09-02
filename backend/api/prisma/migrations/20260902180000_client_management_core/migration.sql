-- Phase 5: Core Client Management. A tenant-scoped Client entity representing
-- an individual or organization counterparty, with create/update/archive/get/list.
-- This is an additive migration: a new tenant-scoped table, no destructive change
-- to existing data.
--
-- Column types FOLLOW the established codebase convention: string (TEXT) ids and
-- tenant FKs, matching the Tenant / Organization / Branch / Department tables
-- created in 20260822190000_identity_tenancy_foundation, and the
-- OrganizationSetting table from 20260902120000_organization_settings_engine.

CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- Add FK to Tenant (TEXT id, matching convention).
ALTER TABLE "Client"
  ADD CONSTRAINT "Client_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Client_id_tenantId_key"
  ON "Client"("id", "tenantId");
CREATE INDEX "Client_tenantId_status_idx"
  ON "Client"("tenantId", "status");
CREATE INDEX "Client_tenantId_clientType_idx"
  ON "Client"("tenantId", "clientType");

-- RLS: identical tenant-isolation policy to the Organization hierarchy tables.
ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Client_tenant_isolation"
  ON "Client"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- The CanManageClients named policy for the Phase 5 client management and list.
-- Unknown/unwired catalog keys are created at runtime by
-- PermissionsService.ensurePermissionId and wired by reconcileBuiltInRoles; this
-- seed makes the catalog row explicit and idempotent, matching the existing
-- rbac_permission_catalog, tenant_switch_policy, and organization_settings_engine
-- migrations. The Permission table is not RLS-enforced.
INSERT INTO "Permission" (id, key, description, "createdAt")
SELECT
  gen_random_uuid()::text,
  'CanManageClients',
  'Create, update, archive, and list clients within the active tenant.',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" WHERE "key" = 'CanManageClients'
);