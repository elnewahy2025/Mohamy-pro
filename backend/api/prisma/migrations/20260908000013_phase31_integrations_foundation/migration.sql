-- Phase 31 integrations foundation (additive).
--
-- Creates the Integration and WebhookEndpoint tables plus the
-- IntegrationStatus and WebhookStatus enums. Table/enum DDL is the
-- Prisma-generated slice for exactly these models.
-- Row Level Security follows the established pattern via
-- public.app_tenant_context_is_valid(): FORCE RLS plus a tenant-isolation
-- policy on every table.
--
-- Webhook secrets are never stored: only SHA-256 hashes persist. Live
-- provider calls and delivery dispatch stay deferred by design.

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DISABLED', 'ENABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('ENABLED', 'DISABLED');

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISABLED',
    "errorMessage" TEXT,
    "enabledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL DEFAULT '[]',
    "secretHash" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'ENABLED',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Integration_tenantId_idx" ON "Integration"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_id_tenantId_key" ON "Integration"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_tenantId_key_key" ON "Integration"("tenantId", "key");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_tenantId_status_idx" ON "WebhookEndpoint"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEndpoint_id_tenantId_key" ON "WebhookEndpoint"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Integration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Integration" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Integration_tenant_isolation"
  ON "Integration"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "WebhookEndpoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEndpoint" FORCE ROW LEVEL SECURITY;
CREATE POLICY "WebhookEndpoint_tenant_isolation"
  ON "WebhookEndpoint"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
