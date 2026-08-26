-- Phase 2 invitation onboarding boundary.
-- Additive only: preserve all prior migration history and fail closed for
-- invitation acceptance until the token-bound context is explicitly set.
ALTER TABLE "MembershipRole"
  ADD COLUMN IF NOT EXISTS "assignmentScope" JSONB;

ALTER TABLE "MembershipRole"
  DROP CONSTRAINT IF EXISTS "MembershipRole_assignment_scope_object_check";

ALTER TABLE "MembershipRole"
  ADD CONSTRAINT "MembershipRole_assignment_scope_object_check"
  CHECK (
    "assignmentScope" IS NULL
    OR jsonb_typeof("assignmentScope") = 'object'
  );

CREATE OR REPLACE FUNCTION public.app_invitation_acceptance_context_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    current_setting('app.invitation_acceptance', true) = 'true'
    AND current_setting('app.user_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND current_setting('app.operation_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND current_setting('app.invitation_token_hash', true) ~* '^[0-9a-f]{64}$'
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'mohamy_app'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.app_invitation_acceptance_context_is_valid() FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.app_invitation_acceptance_context_is_valid() TO mohamy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE
      public."Invitation",
      public."Membership",
      public."MembershipRole"
      TO mohamy_app';
    EXECUTE 'GRANT SELECT ON TABLE
      public."Organization",
      public."Branch",
      public."Department",
      public."Team"
      TO mohamy_app';
  END IF;
END
$$;

CREATE POLICY "Invitation_acceptance_lookup"
  ON "Invitation"
  FOR SELECT
  USING (
    public.app_invitation_acceptance_context_is_valid()
    AND "tokenHash" = current_setting('app.invitation_token_hash', true)
  );

CREATE POLICY "Invitation_acceptance_terminal_update"
  ON "Invitation"
  FOR UPDATE
  USING (
    public.app_invitation_acceptance_context_is_valid()
    AND "tokenHash" = current_setting('app.invitation_token_hash', true)
  )
  WITH CHECK (
    public.app_invitation_acceptance_context_is_valid()
    AND "tokenHash" = current_setting('app.invitation_invalidated_token_hash', true)
  );

CREATE POLICY "Membership_acceptance_subject"
  ON "Membership"
  FOR SELECT
  USING (
    public.app_invitation_acceptance_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
    AND (
      "userId" = current_setting('app.user_id', true)
      OR "id" = current_setting('app.inviter_membership_id', true)
    )
  );

CREATE POLICY "Membership_acceptance_insert"
  ON "Membership"
  FOR INSERT
  WITH CHECK (
    public.app_invitation_acceptance_context_is_valid()
    AND current_setting('app.tenant_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "tenantId" = current_setting('app.tenant_id', true)
    AND "userId" = current_setting('app.user_id', true)
  );

CREATE POLICY "Membership_acceptance_update"
  ON "Membership"
  FOR UPDATE
  USING (
    public.app_invitation_acceptance_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
    AND "userId" = current_setting('app.user_id', true)
  )
  WITH CHECK (
    public.app_invitation_acceptance_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
    AND "userId" = current_setting('app.user_id', true)
  );

CREATE POLICY "MembershipRole_acceptance_insert"
  ON "MembershipRole"
  FOR INSERT
  WITH CHECK (
    public.app_invitation_acceptance_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
    AND "membershipId" = current_setting('app.membership_id', true)
  );

CREATE POLICY "Role_acceptance_lookup"
  ON "Role"
  FOR SELECT
  USING (
    public.app_invitation_acceptance_context_is_valid()
    AND "scope" = 'TENANT'
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "RolePermission_acceptance_lookup"
  ON "RolePermission"
  FOR SELECT
  USING (
    public.app_invitation_acceptance_context_is_valid()
    AND EXISTS (
      SELECT 1
      FROM "Role" AS role_row
      WHERE role_row."id" = "RolePermission"."roleId"
        AND role_row."scope" = 'TENANT'
        AND role_row."tenantId" = current_setting('app.tenant_id', true)
    )
  );
