-- Phase 4: Tenant-owned settings engine. Structured key/value configuration
-- for a tenant that can be extended without code changes (deferred catalog
-- domains live here until a later phase promotes them to first-class models).
-- This is an additive migration: a new tenant-scoped table, no destructive
-- change to existing data.
--
-- Column types FOLLOW the established codebase convention: string (TEXT) ids
-- and tenant FKs, matching the Tenant / Organization / Branch / Department
-- tables created in 20260822190000_identity_tenancy_foundation.

CREATE TABLE "OrganizationSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSetting_pkey" PRIMARY KEY ("id")
);

-- Add FK to Tenant (TEXT id, matching convention).
ALTER TABLE "OrganizationSetting"
  ADD CONSTRAINT "OrganizationSetting_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "OrganizationSetting_tenantId_key_key"
  ON "OrganizationSetting"("tenantId", "key");
CREATE INDEX "OrganizationSetting_tenantId_status_idx"
  ON "OrganizationSetting"("tenantId", "status");

-- RLS: identical tenant-isolation policy to the Organization hierarchy tables.
ALTER TABLE "OrganizationSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "OrganizationSetting_tenant_isolation"
  ON "OrganizationSetting"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- The CanManageOrganizationConfig named policy for the Phase 4 organization
-- configuration and hierarchy. Unknown/unwired catalog keys are created at
-- runtime by PermissionsService.ensurePermissionId and wired by
-- reconcileBuiltInRoles; this seed makes the catalog row explicit and
-- idempotent, matching the existing rbac_permission_catalog and
-- tenant_switch_policy migrations. The Permission table is not RLS-enforced.
INSERT INTO "Permission" (id, key, description, "createdAt")
SELECT
  gen_random_uuid()::text,
  'CanManageOrganizationConfig',
  'Administer organization configuration and hierarchy within the active tenant.',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" WHERE "key" = 'CanManageOrganizationConfig'
);