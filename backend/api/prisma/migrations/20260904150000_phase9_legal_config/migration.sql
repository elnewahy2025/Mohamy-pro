-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "HierarchyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jurisdiction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "HierarchyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Jurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "jurisdictionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courtType" TEXT,
    "department" TEXT,
    "status" "HierarchyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "courtId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "status" "HierarchyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourtLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Country_code_key" ON "Country"("code");

-- CreateIndex
CREATE INDEX "Jurisdiction_tenantId_status_idx" ON "Jurisdiction"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Jurisdiction_id_tenantId_key" ON "Jurisdiction"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Court_tenantId_status_idx" ON "Court"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Court_id_tenantId_key" ON "Court"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CourtLocation_tenantId_status_idx" ON "CourtLocation"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CourtLocation_id_tenantId_key" ON "CourtLocation"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "Jurisdiction" ADD CONSTRAINT "Jurisdiction_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jurisdiction" ADD CONSTRAINT "Jurisdiction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtLocation" ADD CONSTRAINT "CourtLocation_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtLocation" ADD CONSTRAINT "CourtLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant isolation (hybrid tenancy): each tenant-scoped table exposes only the
-- active tenant's rows plus global reference rows (tenantId IS NULL). This is
-- additive enforcement on top of the Prisma-generated DDL and mirrors the
-- convention applied to every preceding migration.

-- Country is a global, tenant-independent dictionary. Access requires a valid
-- tenant context (reads for all authenticated tenant actors). Writes to global
-- reference data are additionally governed at the application layer by the
-- CAN_MANAGE_GLOBAL_LEGAL_CONFIG permission (Platform Admin).
ALTER TABLE "Country" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Country" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Country_tenant_context" ON "Country"
USING (public.app_tenant_context_is_valid())
WITH CHECK (public.app_tenant_context_is_valid());

ALTER TABLE "Jurisdiction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Jurisdiction" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Jurisdiction_hybrid_tenancy" ON "Jurisdiction"
USING (public.app_tenant_context_is_valid() AND ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true)))
WITH CHECK (public.app_tenant_context_is_valid() AND ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true)));

ALTER TABLE "Court" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Court" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Court_hybrid_tenancy" ON "Court"
USING (public.app_tenant_context_is_valid() AND ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true)))
WITH CHECK (public.app_tenant_context_is_valid() AND ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true)));

ALTER TABLE "CourtLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourtLocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CourtLocation_hybrid_tenancy" ON "CourtLocation"
USING (public.app_tenant_context_is_valid() AND ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true)))
WITH CHECK (public.app_tenant_context_is_valid() AND ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true)));

-- Seed Permissions
INSERT INTO "Permission" (id, key, description, "createdAt")
SELECT
  gen_random_uuid()::text,
  'CanManageLegalConfig',
  'Manage tenant-specific legal configurations (e.g. courts, jurisdictions).',
  now()
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "key" = 'CanManageLegalConfig');

INSERT INTO "Permission" (id, key, description, "createdAt")
SELECT
  gen_random_uuid()::text,
  'CanManageGlobalLegalConfig',
  'Manage global legal reference data such as countries (Platform Admin).',
  now()
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "key" = 'CanManageGlobalLegalConfig');
