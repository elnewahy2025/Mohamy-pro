-- Phase 24 portal linkage (additive).
--
-- Adds optional client linkage for portal identity: Membership.clientId and
-- Invitation.clientId (both nullable; existing rows unaffected). No new
-- tables, so no new RLS policies: both tables already carry FORCE RLS with
-- tenant-isolation policies, which cover the new columns automatically.

-- Membership
ALTER TABLE "Membership" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Membership_tenantId_clientId_idx" ON "Membership"("tenantId", "clientId");

-- Invitation
ALTER TABLE "Invitation" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Invitation_tenantId_clientId_idx" ON "Invitation"("tenantId", "clientId");
