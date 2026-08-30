-- Phase 2 tenant-bootstrap foundation (additive).
--
-- Adds the one-time PlatformBootstrap marker table used by the operator
-- bootstrap procedure. A row is inserted in the same transaction that creates
-- the first Tenant, Organization, Membership, and Platform Admin assignments.
-- Its presence is the "bootstrap secret already used / cannot repeat" gate, so
-- it must be readable before any tenant context exists; it is therefore a
-- global table with no RLS and is never updated or deleted.
--
-- No table or enum created by an earlier migration is altered or dropped.

CREATE TABLE "PlatformBootstrap" (
    "id" TEXT NOT NULL,
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorUserId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,

    CONSTRAINT "PlatformBootstrap_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlatformBootstrap_singleton" UNIQUE ("singleton"),
    CONSTRAINT "PlatformBootstrap_singleton_check" CHECK ("singleton" = true)
);

CREATE INDEX "PlatformBootstrap_operatorUserId_idx"
    ON "PlatformBootstrap"("operatorUserId");
CREATE INDEX "PlatformBootstrap_tenantId_idx"
    ON "PlatformBootstrap"("tenantId");

ALTER TABLE "PlatformBootstrap"
    ADD CONSTRAINT "PlatformBootstrap_operatorUserId_fkey"
    FOREIGN KEY ("operatorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformBootstrap"
    ADD CONSTRAINT "PlatformBootstrap_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
