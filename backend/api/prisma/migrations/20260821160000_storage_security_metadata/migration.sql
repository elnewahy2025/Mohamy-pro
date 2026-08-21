CREATE TABLE "StorageObject" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "versionId" TEXT,
    "sha256" VARCHAR(64) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "contentType" TEXT NOT NULL,
    "encryptionMode" TEXT NOT NULL,
    "malwareStatus" TEXT NOT NULL DEFAULT 'PENDING_SCAN',
    "malwareScannedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StorageObject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorageObject_key_versionId_key" ON "StorageObject"("key", "versionId");
CREATE INDEX "StorageObject_malwareStatus_createdAt_idx" ON "StorageObject"("malwareStatus", "createdAt");
CREATE INDEX "StorageObject_retentionUntil_legalHold_idx" ON "StorageObject"("retentionUntil", "legalHold");
