-- CreateEnum
CREATE TYPE "CaseTimelineEventType" AS ENUM ('CASE_CREATED', 'CLIENT_ADDED', 'PARTY_ADDED', 'DOCUMENT_UPLOADED', 'TASK_CREATED', 'HEARING_SCHEDULED', 'DEADLINE_CREATED', 'STATUS_CHANGED', 'NOTE_ADDED', 'INVOICE_CREATED', 'PAYMENT_RECEIVED', 'DOCUMENT_APPROVED', 'CASE_CLOSED');

-- CreateTable
CREATE TABLE "CaseTimelineEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "eventType" "CaseTimelineEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorMembershipId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseTimelineEvent_tenantId_caseId_occurredAt_idx" ON "CaseTimelineEvent"("tenantId", "caseId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CaseTimelineEvent_id_tenantId_key" ON "CaseTimelineEvent"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "CaseTimelineEvent" ADD CONSTRAINT "CaseTimelineEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseTimelineEvent" ADD CONSTRAINT "CaseTimelineEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ROW LEVEL SECURITY
ALTER TABLE "CaseTimelineEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CaseTimelineEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY "_tenant_isolation" ON "CaseTimelineEvent"
  FOR ALL
  USING (
    app_tenant_context_is_valid() 
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    app_tenant_context_is_valid() 
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
