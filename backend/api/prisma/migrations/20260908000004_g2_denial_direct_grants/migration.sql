-- G2 denial evaluation support (additive).
--
-- Creates DirectPermissionGrant (per-membership direct permission grants,
-- revocable) for the central authorization engine. AccessDenial already
-- exists with tenant isolation. DDL is the Prisma-generated slice.
-- Row Level Security follows the established pattern.

-- CreateTable
CREATE TABLE "DirectPermissionGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "grantedByMembershipId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectPermissionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectPermissionGrant_tenantId_membershipId_idx" ON "DirectPermissionGrant"("tenantId", "membershipId");

-- CreateIndex
CREATE INDEX "DirectPermissionGrant_tenantId_permissionKey_idx" ON "DirectPermissionGrant"("tenantId", "permissionKey");

-- AddForeignKey
ALTER TABLE "DirectPermissionGrant" ADD CONSTRAINT "DirectPermissionGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPermissionGrant" ADD CONSTRAINT "DirectPermissionGrant_membershipId_tenantId_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectPermissionGrant" ADD CONSTRAINT "DirectPermissionGrant_grantedByMembershipId_tenantId_fkey" FOREIGN KEY ("grantedByMembershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DirectPermissionGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DirectPermissionGrant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DirectPermissionGrant_tenant_isolation"
  ON "DirectPermissionGrant"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
