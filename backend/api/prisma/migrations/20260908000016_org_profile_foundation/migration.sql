-- Organization UX master plan (AGENTS.md §31), Batch A (additive).
--
-- Profile fields on Organization/Branch, Team→Department link,
-- Membership→Branch/Department links. No new tables, so no RLS changes.
-- Currencies stay validated strings (DTO allowlist), never free text.

-- Organization profile
ALTER TABLE "Organization" ADD COLUMN "website" TEXT;
ALTER TABLE "Organization" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Organization" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Organization" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "Organization" ADD COLUMN "city" TEXT;
ALTER TABLE "Organization" ADD COLUMN "country" TEXT;
ALTER TABLE "Organization" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "Organization" ADD COLUMN "mapUrl" TEXT;
ALTER TABLE "Organization" ADD COLUMN "registrationNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN "taxNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'EGP';
ALTER TABLE "Organization" ADD COLUMN "logoObjectKey" TEXT;
ALTER TABLE "Organization" ADD COLUMN "socialLinks" JSONB NOT NULL DEFAULT '{}';

-- Branch profile
ALTER TABLE "Branch" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Branch" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Branch" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "Branch" ADD COLUMN "city" TEXT;
ALTER TABLE "Branch" ADD COLUMN "country" TEXT;
ALTER TABLE "Branch" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "Branch" ADD COLUMN "mapUrl" TEXT;
ALTER TABLE "Branch" ADD COLUMN "operatingCurrency" TEXT NOT NULL DEFAULT 'EGP';
ALTER TABLE "Branch" ADD COLUMN "workingHours" TEXT;
ALTER TABLE "Branch" ADD COLUMN "managerName" TEXT;
ALTER TABLE "Branch" ADD COLUMN "isHeadOffice" BOOLEAN NOT NULL DEFAULT false;

-- Team → Department link (optional so existing teams survive)
ALTER TABLE "Team" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "Team" ADD CONSTRAINT "Team_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Membership → Branch / Department links (optional so existing members survive)
ALTER TABLE "Membership" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Membership" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Membership_tenantId_branchId_idx" ON "Membership"("tenantId", "branchId");
CREATE INDEX "Membership_tenantId_departmentId_idx" ON "Membership"("tenantId", "departmentId");
