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

-- DropIndex
DROP INDEX "OutboxMessage_status_createdAt_idx";

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
ALTER TABLE "ConflictCheck" DROP COLUMN "prospectiveParties",
ADD COLUMN     "matchSummary" TEXT;

-- AlterTable
ALTER TABLE "ConflictParty" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "kind",
ADD COLUMN     "kind" "ConflictPartyType" NOT NULL;

-- AlterTable
ALTER TABLE "OrganizationSetting" ALTER COLUMN "updatedByMembershipId" SET NOT NULL;

-- AlterTable
ALTER TABLE "StorageObject" ADD COLUMN     "classification" "DataClassification" NOT NULL DEFAULT 'CONFIDENTIAL';

-- DropEnum
DROP TYPE "ConflictPartyKind";

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

-- CreateIndex
CREATE INDEX "CaseParty_tenantId_caseId_idx" ON "CaseParty"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "CaseParty_tenantId_partyId_idx" ON "CaseParty"("tenantId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseParty_tenantId_caseId_partyId_roleId_key" ON "CaseParty"("tenantId", "caseId", "partyId", "roleId");

-- CreateIndex
CREATE INDEX "Client_tenantId_status_idx" ON "Client"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Client_tenantId_clientType_idx" ON "Client"("tenantId", "clientType");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_type_idx" ON "ClientContact"("clientId", "type");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_currentStateId_fkey" FOREIGN KEY ("currentStateId") REFERENCES "WorkflowState"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseParty" ADD CONSTRAINT "CaseParty_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseParty" ADD CONSTRAINT "CaseParty_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "PartyRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

