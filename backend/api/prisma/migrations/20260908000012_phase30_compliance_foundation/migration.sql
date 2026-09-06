-- Phase 30 compliance foundation (additive).
--
-- Creates the RetentionPolicy and LegalHold tables plus the HoldStatus enum.
-- Table/enum DDL is the Prisma-generated slice for exactly these models.
-- Row Level Security follows the established pattern via
-- public.app_tenant_context_is_valid(): FORCE RLS plus a tenant-isolation
-- policy on every table.
--
-- No destructive purge ships in v1: retention evaluation reports eligibility
-- only, so legal holds cannot be violated by automation that does not exist.

-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "retainYears" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "status" "HoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "releasedBy" TEXT,
    "releaseReason" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetentionPolicy_tenantId_idx" ON "RetentionPolicy"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_id_tenantId_key" ON "RetentionPolicy"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_tenantId_targetType_key" ON "RetentionPolicy"("tenantId", "targetType");

-- CreateIndex
CREATE INDEX "LegalHold_tenantId_status_idx" ON "LegalHold"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LegalHold_id_tenantId_key" ON "LegalHold"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LegalHold" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LegalHold" FORCE ROW LEVEL SECURITY;
CREATE POLICY "LegalHold_tenant_isolation"
  ON "LegalHold"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "RetentionPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RetentionPolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "RetentionPolicy_tenant_isolation"
  ON "RetentionPolicy"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
