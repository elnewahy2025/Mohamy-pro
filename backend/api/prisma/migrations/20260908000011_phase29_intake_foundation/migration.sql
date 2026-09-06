-- Phase 29 intake foundation (additive).
--
-- Creates the IntakeRequest table plus the IntakeStatus enum. Table/enum DDL
-- is the Prisma-generated slice for exactly this model.
-- Row Level Security follows the established pattern via
-- public.app_tenant_context_is_valid(): FORCE RLS plus a tenant-isolation
-- policy on the table.

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('NEW', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "IntakeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "clientType" "ClientType" NOT NULL,
    "matterSummary" TEXT NOT NULL,
    "source" TEXT,
    "status" "IntakeStatus" NOT NULL DEFAULT 'NEW',
    "conflictCheckId" TEXT,
    "reviewerMembershipId" TEXT,
    "reviewNotes" TEXT,
    "rejectionReason" TEXT,
    "createdClientId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntakeRequest_tenantId_status_idx" ON "IntakeRequest"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeRequest_id_tenantId_key" ON "IntakeRequest"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "IntakeRequest" ADD CONSTRAINT "IntakeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeRequest" ADD CONSTRAINT "IntakeRequest_conflictCheckId_fkey" FOREIGN KEY ("conflictCheckId") REFERENCES "ConflictCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeRequest" ADD CONSTRAINT "IntakeRequest_createdClientId_fkey" FOREIGN KEY ("createdClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntakeRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntakeRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY "IntakeRequest_tenant_isolation"
  ON "IntakeRequest"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
