-- Phase 25 transfer foundation (additive).
--
-- Creates the data-transfer tables (ImportJob, ImportRowError, ExportJob)
-- plus new transfer enums. Table/enum DDL is the Prisma-generated slice for
-- exactly these models.
-- Row Level Security follows the established pattern via
-- public.app_tenant_context_is_valid(): FORCE RLS plus a tenant-isolation
-- policy on every table.

-- CreateEnum
CREATE TYPE "TransferEntity" AS ENUM ('CASE', 'CLIENT', 'PARTY', 'TASK');

-- CreateEnum
CREATE TYPE "TransferFormat" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPROVED', 'RUNNING', 'COMPLETED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" "TransferEntity" NOT NULL,
    "format" "TransferFormat" NOT NULL DEFAULT 'CSV',
    "storageObjectId" TEXT,
    "content" TEXT,
    "mapping" JSONB,
    "status" "ImportStatus" NOT NULL DEFAULT 'DRAFT',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "resultSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRowError" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "raw" JSONB,
    "errors" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRowError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" "TransferEntity" NOT NULL,
    "filters" JSONB,
    "format" "TransferFormat" NOT NULL DEFAULT 'CSV',
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "storageObjectId" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "maxRows" INTEGER NOT NULL DEFAULT 5000,
    "expiresAt" TIMESTAMP(3),
    "requestedBy" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportJob_tenantId_status_idx" ON "ImportJob"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_tenantId_idempotencyKey_key" ON "ImportJob"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ImportRowError_tenantId_jobId_idx" ON "ImportRowError"("tenantId", "jobId");

-- CreateIndex
CREATE INDEX "ExportJob_tenantId_status_idx" ON "ExportJob"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExportJob_tenantId_idempotencyKey_key" ON "ExportJob"("tenantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRowError" ADD CONSTRAINT "ImportRowError_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRowError" ADD CONSTRAINT "ImportRowError_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExportJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ExportJob_tenant_isolation"
  ON "ExportJob"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "ImportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ImportJob_tenant_isolation"
  ON "ImportJob"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "ImportRowError" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportRowError" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ImportRowError_tenant_isolation"
  ON "ImportRowError"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
