-- DropIndex
DROP INDEX "Department_id_tenantId_key";

-- AlterTable
ALTER TABLE "AppSession" DROP COLUMN "issuedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "providerIdTokenCiphertext" TEXT;

-- CreateIndex
CREATE INDEX "AppSession_userId_activeTenantId_status_idx" ON "AppSession"("userId", "activeTenantId", "status");
