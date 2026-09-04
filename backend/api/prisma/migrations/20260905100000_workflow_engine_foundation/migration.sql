-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "ClientContactType" AS ENUM ('PHONE', 'EMAIL', 'FAX', 'WEBSITE', 'MOBILE');

-- CreateEnum
CREATE TYPE "ClientAddressType" AS ENUM ('MAILING', 'BILLING', 'REGISTERED', 'BRANCH');

-- CreateEnum
CREATE TYPE "ConflictPartyType" AS ENUM ('PARTY', 'RELATED_ENTITY');

-- CreateEnum
CREATE TYPE "DataClassification" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL', 'PRIVILEGED', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "WorkflowVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "currentStateId" TEXT,
ADD COLUMN     "workflowVersionId" TEXT;

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "clientType",
ADD COLUMN     "clientType" "ClientType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "HierarchyStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "ClientAddress" DROP COLUMN "type",
ADD COLUMN     "type" "ClientAddressType" NOT NULL;

-- AlterTable
ALTER TABLE "ClientContact" DROP COLUMN "type",
ADD COLUMN     "type" "ClientContactType" NOT NULL;

-- AlterTable
ALTER TABLE "ConflictParty" DROP COLUMN "kind",
ADD COLUMN     "kind" "ConflictPartyType" NOT NULL;

-- AlterTable
ALTER TABLE "OrganizationSetting" ALTER COLUMN "updatedByMembershipId" SET NOT NULL;

-- AlterTable
ALTER TABLE "StorageObject" ADD COLUMN     "classification" "DataClassification" NOT NULL DEFAULT 'CONFIDENTIAL';

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "caseType" TEXT,
    "status" "HierarchyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "WorkflowVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isInitial" BOOLEAN NOT NULL DEFAULT false,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTransition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fromStateId" TEXT,
    "toStateId" TEXT NOT NULL,
    "conditions" JSONB,
    "actions" JSONB,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workflow_tenantId_status_idx" ON "Workflow"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_tenantId_name_key" ON "Workflow"("tenantId", "name");

-- CreateIndex
CREATE INDEX "WorkflowVersion_tenantId_workflowId_status_idx" ON "WorkflowVersion"("tenantId", "workflowId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_tenantId_workflowId_version_key" ON "WorkflowVersion"("tenantId", "workflowId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowState_tenantId_versionId_name_key" ON "WorkflowState"("tenantId", "versionId", "name");

-- CreateIndex
CREATE INDEX "WorkflowTransition_tenantId_versionId_fromStateId_idx" ON "WorkflowTransition"("tenantId", "versionId", "fromStateId");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_currentStateId_fkey" FOREIGN KEY ("currentStateId") REFERENCES "WorkflowState"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowState" ADD CONSTRAINT "WorkflowState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowState" ADD CONSTRAINT "WorkflowState_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "WorkflowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "WorkflowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_fromStateId_fkey" FOREIGN KEY ("fromStateId") REFERENCES "WorkflowState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_toStateId_fkey" FOREIGN KEY ("toStateId") REFERENCES "WorkflowState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "IdempotencyKey_scope_unique" RENAME TO "IdempotencyKey_key_actorScope_tenantScope_method_route_key";

-- RenameIndex
ALTER INDEX "PlatformBootstrap_singleton" RENAME TO "PlatformBootstrap_singleton_key";
