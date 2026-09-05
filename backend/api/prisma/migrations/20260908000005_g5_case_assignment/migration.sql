-- G5 case-assignment foundation (additive).
--
-- Creates CaseAssignment (case Membership links with soft revoke) for
-- assignment-scoped case access. DDL is the Prisma-generated slice.
-- Row Level Security follows the established pattern.

-- CreateTable
CREATE TABLE "CaseAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdByMembershipId" TEXT,

    CONSTRAINT "CaseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseAssignment_tenantId_membershipId_idx" ON "CaseAssignment"("tenantId", "membershipId");

-- CreateIndex
CREATE INDEX "CaseAssignment_tenantId_caseId_idx" ON "CaseAssignment"("tenantId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAssignment_caseId_membershipId_key" ON "CaseAssignment"("caseId", "membershipId");

-- AddForeignKey
ALTER TABLE "CaseAssignment" ADD CONSTRAINT "CaseAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAssignment" ADD CONSTRAINT "CaseAssignment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAssignment" ADD CONSTRAINT "CaseAssignment_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CaseAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CaseAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CaseAssignment_tenant_isolation"
  ON "CaseAssignment"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
