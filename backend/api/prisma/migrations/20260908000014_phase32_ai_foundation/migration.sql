-- Phase 32 AI foundation (additive).
--
-- Creates the AiRequest table plus the AiRequestStatus enum. Table/enum DDL
-- is the Prisma-generated slice for exactly this model.
-- Row Level Security follows the established pattern via
-- public.app_tenant_context_is_valid(): FORCE RLS plus a tenant-isolation
-- policy on the table.
--
-- No provider execution ships in v1: requests record intent with validated,
-- scope-checked refs; output is filled only by a future provider adapter,
-- and approval requires provider output (enforced, never fabricated).

-- CreateEnum
CREATE TYPE "AiRequestStatus" AS ENUM ('QUEUED', 'READY', 'FAILED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "AiRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "refs" JSONB NOT NULL DEFAULT '[]',
    "promptHint" TEXT,
    "status" "AiRequestStatus" NOT NULL DEFAULT 'QUEUED',
    "outputText" TEXT,
    "outputMeta" JSONB NOT NULL DEFAULT '{}',
    "requestedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRequest_tenantId_status_idx" ON "AiRequest"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AiRequest_id_tenantId_key" ON "AiRequest"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AiRequest_tenant_isolation"
  ON "AiRequest"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
