-- Phase 5 follow-up: ClientContact and ClientAddress sub-resources for a Client.
-- Additive migration: two new tenant-scoped tables, no destructive change.
--
-- Column types FOLLOW the established codebase convention: string (TEXT) ids and
-- tenant FKs, matching the Tenant / Organization / Branch / Department tables and
-- the Client table from 20260902180000_client_management_core.

CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientAddress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAddress_pkey" PRIMARY KEY ("id")
);

-- FKs to Tenant (TEXT id) and Client (must be in the same tenant). Client FK is
-- CASCADE (deleting a client removes its contacts/addresses); Tenant FK RESTRICT.
ALTER TABLE "ClientContact"
  ADD CONSTRAINT "ClientContact_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientContact"
  ADD CONSTRAINT "ClientContact_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientAddress"
  ADD CONSTRAINT "ClientAddress_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientAddress"
  ADD CONSTRAINT "ClientAddress_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes / unique names match Prisma convention for the schema.
CREATE UNIQUE INDEX "ClientContact_id_tenantId_key"
  ON "ClientContact"("id", "tenantId");
CREATE INDEX "ClientContact_tenantId_clientId_idx"
  ON "ClientContact"("tenantId", "clientId");
CREATE INDEX "ClientContact_clientId_type_idx"
  ON "ClientContact"("clientId", "type");

CREATE UNIQUE INDEX "ClientAddress_id_tenantId_key"
  ON "ClientAddress"("id", "tenantId");
CREATE INDEX "ClientAddress_tenantId_clientId_idx"
  ON "ClientAddress"("tenantId", "clientId");

-- RLS: identical tenant-isolation policy to the Client / org-hierarchy tables.
ALTER TABLE "ClientContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientContact" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ClientContact_tenant_isolation"
  ON "ClientContact"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "ClientAddress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientAddress" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ClientAddress_tenant_isolation"
  ON "ClientAddress"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );