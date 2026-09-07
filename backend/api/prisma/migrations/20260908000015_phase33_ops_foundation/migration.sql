-- Phase 33 operations foundation (additive).
--
-- Creates the BackupPolicy and RestoreDrill tables plus the DrillStatus enum.
-- Table/enum DDL is the Prisma-generated slice for exactly these models.
-- Row Level Security follows the established pattern via
-- public.app_tenant_context_is_valid(): FORCE RLS plus a tenant-isolation
-- policy on every table.
--
-- Snapshot execution stays platform-side (Neon PITR / pgBackRest): the app
-- records governance (policies, operator-attested drills) and real status.
-- Nothing fabricates a backup or a passing drill.

-- CreateEnum
CREATE TYPE "DrillStatus" AS ENUM ('PLANNED', 'PASSED', 'FAILED');

-- CreateTable
CREATE TABLE "BackupPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rpoHours" INTEGER NOT NULL,
    "rtoHours" INTEGER NOT NULL,
    "scheduleCron" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestoreDrill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetRef" TEXT NOT NULL,
    "status" "DrillStatus" NOT NULL DEFAULT 'PLANNED',
    "checks" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "startedBy" TEXT NOT NULL,
    "finishedBy" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestoreDrill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BackupPolicy_id_tenantId_key" ON "BackupPolicy"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BackupPolicy_tenantId_key" ON "BackupPolicy"("tenantId");

-- CreateIndex
CREATE INDEX "RestoreDrill_tenantId_status_idx" ON "RestoreDrill"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestoreDrill_id_tenantId_key" ON "RestoreDrill"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "BackupPolicy" ADD CONSTRAINT "BackupPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestoreDrill" ADD CONSTRAINT "RestoreDrill_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BackupPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BackupPolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "BackupPolicy_tenant_isolation"
  ON "BackupPolicy"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "RestoreDrill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RestoreDrill" FORCE ROW LEVEL SECURITY;
CREATE POLICY "RestoreDrill_tenant_isolation"
  ON "RestoreDrill"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
