-- G7 break-glass foundation (additive).
--
-- Creates BreakGlassActivation (case-scoped emergency elevation with
-- mandatory window and attribution) for enforceable break-glass access.
-- DDL is the Prisma-generated slice. Row Level Security follows the
-- established pattern. Every bypass writes a breakglass.used audit event.

-- CreateTable
CREATE TABLE "BreakGlassActivation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectMembershipId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdByMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakGlassActivation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BreakGlassActivation_tenantId_subjectMembershipId_idx" ON "BreakGlassActivation"("tenantId", "subjectMembershipId");

-- CreateIndex
CREATE INDEX "BreakGlassActivation_tenantId_caseId_idx" ON "BreakGlassActivation"("tenantId", "caseId");

-- AddForeignKey
ALTER TABLE "BreakGlassActivation" ADD CONSTRAINT "BreakGlassActivation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakGlassActivation" ADD CONSTRAINT "BreakGlassActivation_subjectMembershipId_tenantId_fkey" FOREIGN KEY ("subjectMembershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakGlassActivation" ADD CONSTRAINT "BreakGlassActivation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakGlassActivation" ADD CONSTRAINT "BreakGlassActivation_createdByMembershipId_tenantId_fkey" FOREIGN KEY ("createdByMembershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BreakGlassActivation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BreakGlassActivation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "BreakGlassActivation_tenant_isolation"
  ON "BreakGlassActivation"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
