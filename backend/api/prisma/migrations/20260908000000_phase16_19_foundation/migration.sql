-- Phase 16-19 foundation (additive).
--
-- Creates the Phase 16 (document security), Phase 17 (OCR pipeline),
-- Phase 18 (search), Phase 19 (document templates) and Phase 16
-- (time-tracking) tables that were added to schema.prisma without a
-- migration, plus the tenantId columns on the five child tables that
-- lacked one (OcrPage, OcrEntity, ClassificationResult, HumanReview,
-- TemplateVariable) per the Phase 10-15 RLS precedent.
--
-- Table/enum DDL is the Prisma-generated slice for exactly these models
-- (offline `migrate diff --from-empty` filtered to the new models).
-- Row Level Security follows the Phase 2/10-15 pattern via the
-- public.app_tenant_context_is_valid() helper: FORCE RLS plus a
-- tenant-isolation policy on every tenant-owned table, and a
-- context-validity policy on the global SearchIndexVersion table.
-- Application write paths set "tenantId" on every inserted row
-- (see ocr-processing.service.ts, human-review.service.ts).
-- CreateEnum
CREATE TYPE "DocumentSecurityStatus" AS ENUM ('PENDING', 'VALIDATING', 'SCANNING', 'APPROVED', 'QUARANTINED', 'REJECTED', 'EXPIRED', 'REVOKED');
-- CreateEnum
CREATE TYPE "DocumentScanStatus" AS ENUM ('PENDING', 'RUNNING', 'CLEAN', 'INFECTED', 'FAILED');
-- CreateEnum
CREATE TYPE "DocumentAccessPurpose" AS ENUM ('DOWNLOAD', 'PREVIEW', 'SHARE');
-- CreateEnum
CREATE TYPE "DocumentDownloadResult" AS ENUM ('SUCCESS', 'DENIED', 'EXPIRED', 'REVOKED', 'QUARANTINED', 'NOT_FOUND');
-- CreateEnum
CREATE TYPE "OcrProcessingStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('NATIVE_TEXT', 'OCR');
-- CreateEnum
CREATE TYPE "HumanReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CORRECTION_REQUIRED');
-- CreateEnum
CREATE TYPE "SearchReindexStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ARCHIVED');
-- CreateEnum
CREATE TYPE "TemplateVersionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'RETIRED');
-- CreateEnum
CREATE TYPE "TemplateVariableType" AS ENUM ('STRING', 'NUMBER', 'DATE', 'DATETIME', 'BOOLEAN', 'CURRENCY', 'TEXT', 'ENUM');
-- CreateEnum
CREATE TYPE "TemplateVariableSource" AS ENUM ('MANUAL', 'CASE', 'CLIENT', 'PARTY', 'ORGANIZATION', 'USER', 'COMPUTED');
-- CreateEnum
CREATE TYPE "TemplateVariableSensitivity" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'SENSITIVE', 'RESTRICTED');
-- CreateEnum
CREATE TYPE "TemplateApprovalState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
-- CreateEnum
CREATE TYPE "DocumentGenerationStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'INVOICED');
-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('USER', 'CLIENT', 'CASE', 'DEFAULT');
-- CreateEnum
CREATE TYPE "TimerStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');
-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('EGP', 'USD');

-- CreateTable
CREATE TABLE "DocumentSecurityMetadata" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "storageObjectId" TEXT NOT NULL,
    "securityStatus" "DocumentSecurityStatus" NOT NULL DEFAULT 'PENDING',
    "mimeTypeDetected" TEXT,
    "fileExtensionDetected" TEXT,
    "fileSizeBytes" BIGINT,
    "sha256" TEXT,
    "contentHashAlgorithm" TEXT,
    "encryptionStatus" TEXT,
    "encryptionAlgorithm" TEXT,
    "keyReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSecurityMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentScan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "scannerProvider" TEXT NOT NULL,
    "scannerVersion" TEXT,
    "status" "DocumentScanStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "signatureVersion" TEXT,
    "threatName" TEXT,
    "resultMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignedAccessGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "storageObjectId" TEXT NOT NULL,
    "issuedToUserId" TEXT,
    "purpose" "DocumentAccessPurpose" NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "accessTokenId" TEXT NOT NULL,

    CONSTRAINT "SignedAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentDownload" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "storageObjectId" TEXT NOT NULL,
    "userId" TEXT,
    "membershipId" TEXT,
    "sessionId" TEXT,
    "accessGrantId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "result" "DocumentDownloadResult" NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "correlationId" TEXT,

    CONSTRAINT "DocumentDownload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrProcessing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "status" "OcrProcessingStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL,
    "providerVersion" TEXT,
    "modelVersion" TEXT,
    "languageConfig" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "correlationId" TEXT,
    "jobId" TEXT,

    CONSTRAINT "OcrProcessing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrPage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ocrProcessingId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "extractionMethod" "ExtractionMethod" NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrEntity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ocrProcessingId" TEXT NOT NULL,
    "pageId" TEXT,
    "entityType" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT,
    "confidence" DOUBLE PRECISION,
    "sourceStart" INTEGER,
    "sourceEnd" INTEGER,
    "machineGenerated" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificationResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ocrProcessingId" TEXT NOT NULL,
    "predictedCategory" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "modelVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ocrProcessingId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "status" "HumanReviewStatus" NOT NULL DEFAULT 'PENDING',
    "decision" TEXT,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovedDocumentMetadata" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "ocrProcessingId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "category" TEXT,
    "entities" JSONB,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovedDocumentMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchIndexVersion" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "indexName" TEXT NOT NULL,
    "aliasName" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchIndexVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchReindexJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "entityType" TEXT NOT NULL,
    "targetIndexId" TEXT NOT NULL,
    "status" "SearchReindexStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SearchReindexJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "documentTypeId" TEXT,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "outputFormats" TEXT[],
    "currentVersionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "TemplateVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceObjectId" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "variableSchema" JSONB,
    "templateMetadata" JSONB,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVariable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" "TemplateVariableType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sourceType" "TemplateVariableSource" NOT NULL,
    "sourcePath" TEXT,
    "validationSchema" JSONB,
    "defaultValue" JSONB,
    "sensitivity" "TemplateVariableSensitivity" NOT NULL DEFAULT 'INTERNAL',

    CONSTRAINT "TemplateVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "reviewerId" TEXT,
    "state" "TemplateApprovalState" NOT NULL DEFAULT 'PENDING',
    "decisionReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "TemplateApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentGenerationJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "caseId" TEXT,
    "clientId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "DocumentGenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedFormats" TEXT[],
    "inputSnapshot" JSONB,
    "resultDocumentIds" TEXT[],
    "errorCode" TEXT,
    "errorMessageSafe" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "RateType" NOT NULL,
    "referenceId" TEXT NOT NULL,
    "hourlyRate" DECIMAL(19,4) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'EGP',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT,
    "clientId" TEXT,
    "date" DATE NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "isBillable" BOOLEAN NOT NULL DEFAULT true,
    "rateAmount" DECIMAL(19,4),
    "currency" "CurrencyCode",
    "totalAmount" DECIMAL(19,4),
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT,
    "clientId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accumulatedSeconds" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" "TimerStatus" NOT NULL DEFAULT 'RUNNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Timer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSecurityMetadata_documentVersionId_key" ON "DocumentSecurityMetadata"("documentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSecurityMetadata_storageObjectId_key" ON "DocumentSecurityMetadata"("storageObjectId");

-- CreateIndex
CREATE INDEX "DocumentSecurityMetadata_tenantId_securityStatus_idx" ON "DocumentSecurityMetadata"("tenantId", "securityStatus");

-- CreateIndex
CREATE INDEX "DocumentSecurityMetadata_tenantId_sha256_idx" ON "DocumentSecurityMetadata"("tenantId", "sha256");

-- CreateIndex
CREATE INDEX "DocumentScan_tenantId_idx" ON "DocumentScan"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SignedAccessGrant_accessTokenId_key" ON "SignedAccessGrant"("accessTokenId");

-- CreateIndex
CREATE INDEX "SignedAccessGrant_tenantId_documentId_idx" ON "SignedAccessGrant"("tenantId", "documentId");

-- CreateIndex
CREATE INDEX "SignedAccessGrant_tenantId_expiresAt_idx" ON "SignedAccessGrant"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "DocumentDownload_tenantId_idx" ON "DocumentDownload"("tenantId");

-- CreateIndex
CREATE INDEX "OcrProcessing_tenantId_idx" ON "OcrProcessing"("tenantId");

-- CreateIndex
CREATE INDEX "OcrPage_ocrProcessingId_idx" ON "OcrPage"("ocrProcessingId");

-- CreateIndex
CREATE INDEX "OcrPage_tenantId_idx" ON "OcrPage"("tenantId");

-- CreateIndex
CREATE INDEX "OcrEntity_ocrProcessingId_idx" ON "OcrEntity"("ocrProcessingId");

-- CreateIndex
CREATE INDEX "OcrEntity_tenantId_idx" ON "OcrEntity"("tenantId");

-- CreateIndex
CREATE INDEX "ClassificationResult_ocrProcessingId_idx" ON "ClassificationResult"("ocrProcessingId");

-- CreateIndex
CREATE INDEX "ClassificationResult_tenantId_idx" ON "ClassificationResult"("tenantId");

-- CreateIndex
CREATE INDEX "HumanReview_ocrProcessingId_idx" ON "HumanReview"("ocrProcessingId");

-- CreateIndex
CREATE INDEX "HumanReview_tenantId_idx" ON "HumanReview"("tenantId");

-- CreateIndex
CREATE INDEX "ApprovedDocumentMetadata_tenantId_idx" ON "ApprovedDocumentMetadata"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SearchIndexVersion_indexName_key" ON "SearchIndexVersion"("indexName");

-- CreateIndex
CREATE INDEX "SearchReindexJob_tenantId_idx" ON "SearchReindexJob"("tenantId");

-- CreateIndex
CREATE INDEX "Template_tenantId_status_idx" ON "Template"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Template_tenantId_updatedAt_idx" ON "Template"("tenantId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Template_tenantId_code_key" ON "Template"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TemplateVersion_tenantId_templateId_status_idx" ON "TemplateVersion"("tenantId", "templateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_tenantId_templateId_versionNumber_key" ON "TemplateVersion"("tenantId", "templateId", "versionNumber");

-- CreateIndex
CREATE INDEX "TemplateVariable_tenantId_idx" ON "TemplateVariable"("tenantId");

-- CreateIndex
CREATE INDEX "TemplateApproval_tenantId_templateVersionId_state_idx" ON "TemplateApproval"("tenantId", "templateVersionId", "state");

-- CreateIndex
CREATE INDEX "TemplateApproval_tenantId_requestedBy_idx" ON "TemplateApproval"("tenantId", "requestedBy");

-- CreateIndex
CREATE INDEX "DocumentGenerationJob_tenantId_status_createdAt_idx" ON "DocumentGenerationJob"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentGenerationJob_tenantId_templateId_createdAt_idx" ON "DocumentGenerationJob"("tenantId", "templateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentGenerationJob_tenantId_idempotencyKey_key" ON "DocumentGenerationJob"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Rate_tenantId_type_referenceId_idx" ON "Rate"("tenantId", "type", "referenceId");

-- CreateIndex
CREATE INDEX "TimeEntry_tenantId_userId_date_idx" ON "TimeEntry"("tenantId", "userId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_tenantId_caseId_status_idx" ON "TimeEntry"("tenantId", "caseId", "status");

-- CreateIndex
CREATE INDEX "Timer_tenantId_userId_status_idx" ON "Timer"("tenantId", "userId", "status");

-- AddForeignKey
ALTER TABLE "DocumentSecurityMetadata" ADD CONSTRAINT "DocumentSecurityMetadata_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSecurityMetadata" ADD CONSTRAINT "DocumentSecurityMetadata_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSecurityMetadata" ADD CONSTRAINT "DocumentSecurityMetadata_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentScan" ADD CONSTRAINT "DocumentScan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentScan" ADD CONSTRAINT "DocumentScan_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentScan" ADD CONSTRAINT "DocumentScan_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedAccessGrant" ADD CONSTRAINT "SignedAccessGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedAccessGrant" ADD CONSTRAINT "SignedAccessGrant_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedAccessGrant" ADD CONSTRAINT "SignedAccessGrant_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedAccessGrant" ADD CONSTRAINT "SignedAccessGrant_issuedToUserId_fkey" FOREIGN KEY ("issuedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDownload" ADD CONSTRAINT "DocumentDownload_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDownload" ADD CONSTRAINT "DocumentDownload_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDownload" ADD CONSTRAINT "DocumentDownload_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDownload" ADD CONSTRAINT "DocumentDownload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDownload" ADD CONSTRAINT "DocumentDownload_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDownload" ADD CONSTRAINT "DocumentDownload_accessGrantId_fkey" FOREIGN KEY ("accessGrantId") REFERENCES "SignedAccessGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrProcessing" ADD CONSTRAINT "OcrProcessing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrProcessing" ADD CONSTRAINT "OcrProcessing_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrProcessing" ADD CONSTRAINT "OcrProcessing_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrPage" ADD CONSTRAINT "OcrPage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrPage" ADD CONSTRAINT "OcrPage_ocrProcessingId_fkey" FOREIGN KEY ("ocrProcessingId") REFERENCES "OcrProcessing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrEntity" ADD CONSTRAINT "OcrEntity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrEntity" ADD CONSTRAINT "OcrEntity_ocrProcessingId_fkey" FOREIGN KEY ("ocrProcessingId") REFERENCES "OcrProcessing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationResult" ADD CONSTRAINT "ClassificationResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationResult" ADD CONSTRAINT "ClassificationResult_ocrProcessingId_fkey" FOREIGN KEY ("ocrProcessingId") REFERENCES "OcrProcessing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReview" ADD CONSTRAINT "HumanReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReview" ADD CONSTRAINT "HumanReview_ocrProcessingId_fkey" FOREIGN KEY ("ocrProcessingId") REFERENCES "OcrProcessing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReview" ADD CONSTRAINT "HumanReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedDocumentMetadata" ADD CONSTRAINT "ApprovedDocumentMetadata_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedDocumentMetadata" ADD CONSTRAINT "ApprovedDocumentMetadata_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedDocumentMetadata" ADD CONSTRAINT "ApprovedDocumentMetadata_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedDocumentMetadata" ADD CONSTRAINT "ApprovedDocumentMetadata_ocrProcessingId_fkey" FOREIGN KEY ("ocrProcessingId") REFERENCES "OcrProcessing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedDocumentMetadata" ADD CONSTRAINT "ApprovedDocumentMetadata_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchReindexJob" ADD CONSTRAINT "SearchReindexJob_targetIndexId_fkey" FOREIGN KEY ("targetIndexId") REFERENCES "SearchIndexVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchReindexJob" ADD CONSTRAINT "SearchReindexJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVariable" ADD CONSTRAINT "TemplateVariable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVariable" ADD CONSTRAINT "TemplateVariable_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateApproval" ADD CONSTRAINT "TemplateApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateApproval" ADD CONSTRAINT "TemplateApproval_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGenerationJob" ADD CONSTRAINT "DocumentGenerationJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGenerationJob" ADD CONSTRAINT "DocumentGenerationJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGenerationJob" ADD CONSTRAINT "DocumentGenerationJob_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGenerationJob" ADD CONSTRAINT "DocumentGenerationJob_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGenerationJob" ADD CONSTRAINT "DocumentGenerationJob_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timer" ADD CONSTRAINT "Timer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timer" ADD CONSTRAINT "Timer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timer" ADD CONSTRAINT "Timer_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timer" ADD CONSTRAINT "Timer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApprovedDocumentMetadata" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovedDocumentMetadata" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ApprovedDocumentMetadata_tenant_isolation"
  ON "ApprovedDocumentMetadata"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "ClassificationResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClassificationResult" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ClassificationResult_tenant_isolation"
  ON "ClassificationResult"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "DocumentDownload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentDownload" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DocumentDownload_tenant_isolation"
  ON "DocumentDownload"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "DocumentGenerationJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentGenerationJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DocumentGenerationJob_tenant_isolation"
  ON "DocumentGenerationJob"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "DocumentScan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentScan" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DocumentScan_tenant_isolation"
  ON "DocumentScan"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "DocumentSecurityMetadata" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentSecurityMetadata" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DocumentSecurityMetadata_tenant_isolation"
  ON "DocumentSecurityMetadata"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "HumanReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HumanReview" FORCE ROW LEVEL SECURITY;
CREATE POLICY "HumanReview_tenant_isolation"
  ON "HumanReview"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "OcrEntity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OcrEntity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "OcrEntity_tenant_isolation"
  ON "OcrEntity"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "OcrPage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OcrPage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "OcrPage_tenant_isolation"
  ON "OcrPage"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "OcrProcessing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OcrProcessing" FORCE ROW LEVEL SECURITY;
CREATE POLICY "OcrProcessing_tenant_isolation"
  ON "OcrProcessing"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "Rate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Rate" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Rate_tenant_isolation"
  ON "Rate"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "SearchReindexJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SearchReindexJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY "SearchReindexJob_tenant_isolation"
  ON "SearchReindexJob"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "SignedAccessGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SignedAccessGrant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "SignedAccessGrant_tenant_isolation"
  ON "SignedAccessGrant"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "Template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Template" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Template_tenant_isolation"
  ON "Template"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "TemplateApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TemplateApproval" FORCE ROW LEVEL SECURITY;
CREATE POLICY "TemplateApproval_tenant_isolation"
  ON "TemplateApproval"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "TemplateVariable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TemplateVariable" FORCE ROW LEVEL SECURITY;
CREATE POLICY "TemplateVariable_tenant_isolation"
  ON "TemplateVariable"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "TemplateVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TemplateVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY "TemplateVersion_tenant_isolation"
  ON "TemplateVersion"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "TimeEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimeEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "TimeEntry_tenant_isolation"
  ON "TimeEntry"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "Timer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Timer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Timer_tenant_isolation"
  ON "Timer"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- SearchIndexVersion is global, tenant-independent search infrastructure.
-- Access requires a valid tenant context; writes are governed at the
-- application layer by search-admin authorization.
ALTER TABLE "SearchIndexVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SearchIndexVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY "SearchIndexVersion_tenant_context" ON "SearchIndexVersion"
USING (public.app_tenant_context_is_valid())
WITH CHECK (public.app_tenant_context_is_valid());
