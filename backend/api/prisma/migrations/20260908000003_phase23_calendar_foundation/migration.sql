-- Phase 23 calendar foundation (additive).
--
-- Creates the calendar integration tables (CalendarConnection,
-- CalendarSyncCursor, CalendarEventMapping, CalendarSyncConflict) plus new
-- calendar enums. Table/enum DDL is the Prisma-generated slice for exactly
-- these models. No OAuth token columns exist by design (tokens are never
-- stored until Vault Transit is live).
-- Row Level Security follows the established pattern via
-- public.app_tenant_context_is_valid(): FORCE RLS plus a tenant-isolation
-- policy on every table.

-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "CalendarLocalType" AS ENUM ('HEARING', 'DEADLINE', 'TASK');

-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('PUSH', 'PULL');

-- CreateEnum
CREATE TYPE "ConflictResolution" AS ENUM ('PENDING', 'LOCAL_WINS', 'REMOTE_WINS');

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "accountRef" TEXT NOT NULL,
    "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'DISABLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncCursor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "resource" TEXT NOT NULL DEFAULT 'CALENDAR',
    "syncToken" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "localType" "CalendarLocalType" NOT NULL,
    "localId" TEXT NOT NULL,
    "externalId" TEXT,
    "etag" TEXT,
    "direction" "SyncDirection" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEventMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncConflict" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "localType" "CalendarLocalType" NOT NULL,
    "localId" TEXT NOT NULL,
    "externalId" TEXT,
    "reason" TEXT NOT NULL,
    "resolution" "ConflictResolution" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSyncConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarConnection_tenantId_status_idx" ON "CalendarConnection"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_tenantId_provider_accountRef_key" ON "CalendarConnection"("tenantId", "provider", "accountRef");

-- CreateIndex
CREATE INDEX "CalendarSyncCursor_tenantId_idx" ON "CalendarSyncCursor"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSyncCursor_tenantId_connectionId_resource_key" ON "CalendarSyncCursor"("tenantId", "connectionId", "resource");

-- CreateIndex
CREATE INDEX "CalendarEventMapping_tenantId_connectionId_idx" ON "CalendarEventMapping"("tenantId", "connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventMapping_tenantId_connectionId_localType_localI_key" ON "CalendarEventMapping"("tenantId", "connectionId", "localType", "localId");

-- CreateIndex
CREATE INDEX "CalendarSyncConflict_tenantId_connectionId_resolution_idx" ON "CalendarSyncConflict"("tenantId", "connectionId", "resolution");

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncCursor" ADD CONSTRAINT "CalendarSyncCursor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncCursor" ADD CONSTRAINT "CalendarSyncCursor_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventMapping" ADD CONSTRAINT "CalendarEventMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventMapping" ADD CONSTRAINT "CalendarEventMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncConflict" ADD CONSTRAINT "CalendarSyncConflict_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncConflict" ADD CONSTRAINT "CalendarSyncConflict_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarConnection" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CalendarConnection_tenant_isolation"
  ON "CalendarConnection"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "CalendarEventMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarEventMapping" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CalendarEventMapping_tenant_isolation"
  ON "CalendarEventMapping"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "CalendarSyncConflict" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarSyncConflict" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CalendarSyncConflict_tenant_isolation"
  ON "CalendarSyncConflict"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "CalendarSyncCursor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarSyncCursor" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CalendarSyncCursor_tenant_isolation"
  ON "CalendarSyncCursor"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
