-- CreateEnum
CREATE TYPE "HearingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'POSTPONED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Hearing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "courtId" TEXT,
    "courtLocationId" TEXT,
    "assignedLawyerId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT,
    "hearingType" TEXT,
    "status" "HearingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "outcome" TEXT,
    "notes" TEXT,
    "nextHearingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hearing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hearing_nextHearingId_key" ON "Hearing"("nextHearingId");

-- CreateIndex
CREATE INDEX "Hearing_tenantId_date_idx" ON "Hearing"("tenantId", "date");

-- CreateIndex
CREATE INDEX "Hearing_tenantId_caseId_idx" ON "Hearing"("tenantId", "caseId");

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_courtLocationId_fkey" FOREIGN KEY ("courtLocationId") REFERENCES "CourtLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_assignedLawyerId_fkey" FOREIGN KEY ("assignedLawyerId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_nextHearingId_fkey" FOREIGN KEY ("nextHearingId") REFERENCES "Hearing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

