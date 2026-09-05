-- Phase 22 communications foundation (additive).
--
-- Creates the communications hub tables (MessageThread, Message,
-- MessageAttachment, MessageConsent) plus new communications enums.
-- Table/enum DDL is the Prisma-generated slice for exactly these models.
-- Row Level Security follows the established pattern via
-- public.app_tenant_context_is_valid(): FORCE RLS plus a tenant-isolation
-- policy on every table. Outbound provider dispatch is deferred; messages
-- rest at QUEUED until a provider is wired (fail-closed by absence).

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PHONE', 'INTERNAL', 'PORTAL');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('OPT_IN', 'OPT_OUT');

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subject" TEXT,
    "caseId" TEXT,
    "clientId" TEXT,
    "taskId" TEXT,
    "status" "ThreadStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threadId" TEXT,
    "channel" "CommunicationChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "caseId" TEXT,
    "clientId" TEXT,
    "taskId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "storageObjectId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageThread_tenantId_caseId_idx" ON "MessageThread"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "MessageThread_tenantId_clientId_idx" ON "MessageThread"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "MessageThread_tenantId_idx" ON "MessageThread"("tenantId");

-- CreateIndex
CREATE INDEX "Message_tenantId_threadId_idx" ON "Message"("tenantId", "threadId");

-- CreateIndex
CREATE INDEX "Message_tenantId_caseId_idx" ON "Message"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "Message_tenantId_clientId_idx" ON "Message"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "Message_tenantId_channel_status_idx" ON "Message"("tenantId", "channel", "status");

-- CreateIndex
CREATE INDEX "MessageAttachment_tenantId_messageId_idx" ON "MessageAttachment"("tenantId", "messageId");

-- CreateIndex
CREATE INDEX "MessageConsent_tenantId_clientId_idx" ON "MessageConsent"("tenantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageConsent_tenantId_clientId_channel_key" ON "MessageConsent"("tenantId", "clientId", "channel");

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageConsent" ADD CONSTRAINT "MessageConsent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageConsent" ADD CONSTRAINT "MessageConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Message_tenant_isolation"
  ON "Message"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "MessageAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageAttachment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MessageAttachment_tenant_isolation"
  ON "MessageAttachment"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "MessageConsent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageConsent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MessageConsent_tenant_isolation"
  ON "MessageConsent"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "MessageThread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageThread" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MessageThread_tenant_isolation"
  ON "MessageThread"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
