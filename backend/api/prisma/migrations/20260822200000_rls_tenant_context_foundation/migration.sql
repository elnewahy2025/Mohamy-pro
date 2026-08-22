-- Phase 2 RLS foundation.
--
-- This migration deliberately enables RLS only for the Phase 2 tenant-owned
-- tables whose callers can be moved behind the transaction-context helper.
-- StorageObject, OutboxMessage, and IdempotencyKey remain unchanged here
-- because their Phase 1 callers still operate on nullable tenantId rows and
-- have not yet been migrated to tenant-aware repositories. They must not be
-- given a permissive tenantId IS NULL policy.

-- Return false when any required setting is absent, empty, or not a UUID.
-- Membership ownership and lifecycle are validated by the authenticated
-- membership service before withTenantContext is entered. The function does
-- not query Membership, avoiding recursive evaluation of the Membership RLS
-- policy while retaining a database-enforced fail-closed tenant boundary.
CREATE OR REPLACE FUNCTION public.app_tenant_context_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    current_setting('app.tenant_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND current_setting('app.user_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND current_setting('app.membership_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND current_setting('app.operation_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$$;

-- The membership-switch operation has a separate, read-only pre-context
-- boundary. It permits the authenticated user to inspect only that user’s
-- candidate memberships; it never authorizes tenant-owned writes.
CREATE OR REPLACE FUNCTION public.app_membership_selection_context_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    coalesce(current_setting('app.tenant_id', true), '') = ''
    AND coalesce(current_setting('app.membership_id', true), '') = ''
    AND current_setting('app.user_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND current_setting('app.operation_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$$;

-- Organization hierarchy root.
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Organization_tenant_isolation"
  ON "Organization"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- Branch hierarchy node.
ALTER TABLE "Branch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Branch" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Branch_tenant_isolation"
  ON "Branch"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- Department hierarchy node.
ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Department" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Department_tenant_isolation"
  ON "Department"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- Team assignment construct.
ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Team" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Team_tenant_isolation"
  ON "Team"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- Membership is tenant-owned; actor ownership and lifecycle checks remain in
-- the authenticated membership service before context establishment.
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Membership_tenant_isolation"
  ON "Membership"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "Membership_authenticated_user_selection"
  ON "Membership"
  FOR SELECT
  USING (
    public.app_membership_selection_context_is_valid()
    AND "userId" = current_setting('app.user_id', true)
  );

-- Team membership assignment.
ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamMember" FORCE ROW LEVEL SECURITY;
CREATE POLICY "TeamMember_tenant_isolation"
  ON "TeamMember"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- Tenant invitation state.
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Invitation_tenant_isolation"
  ON "Invitation"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- Tenant-scoped role definitions. Global catalog roles remain visible without
-- tenant context; the CHECK constraint prevents a global role from carrying a
-- tenantId or a tenant role from omitting one.
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Role_global_or_tenant_isolation"
  ON "Role"
  USING (
    ("scope" = 'GLOBAL' AND "tenantId" IS NULL)
    OR (
      public.app_tenant_context_is_valid()
      AND "scope" = 'TENANT'
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    ("scope" = 'GLOBAL' AND "tenantId" IS NULL)
    OR (
      public.app_tenant_context_is_valid()
      AND "scope" = 'TENANT'
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
  );

-- Assignment of roles to a tenant membership.
ALTER TABLE "MembershipRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MembershipRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MembershipRole_tenant_isolation"
  ON "MembershipRole"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- Role-permission rows inherit scope from their role. Global role catalog rows
-- remain available; tenant role rows require the active tenant context.
ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" FORCE ROW LEVEL SECURITY;
CREATE POLICY "RolePermission_global_or_tenant_isolation"
  ON "RolePermission"
  USING (
    EXISTS (
      SELECT 1
      FROM "Role" AS role_row
      WHERE role_row."id" = "RolePermission"."roleId"
        AND (
          (role_row."scope" = 'GLOBAL' AND role_row."tenantId" IS NULL)
          OR (
            public.app_tenant_context_is_valid()
            AND role_row."scope" = 'TENANT'
            AND role_row."tenantId" = current_setting('app.tenant_id', true)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "Role" AS role_row
      WHERE role_row."id" = "RolePermission"."roleId"
        AND (
          (role_row."scope" = 'GLOBAL' AND role_row."tenantId" IS NULL)
          OR (
            public.app_tenant_context_is_valid()
            AND role_row."scope" = 'TENANT'
            AND role_row."tenantId" = current_setting('app.tenant_id', true)
          )
        )
    )
  );

-- Explicit tenant denials are visible only inside their server-selected tenant.
ALTER TABLE "AccessDenial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessDenial" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AccessDenial_tenant_isolation"
  ON "AccessDenial"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );
