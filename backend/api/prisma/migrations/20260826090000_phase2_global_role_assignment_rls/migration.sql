-- Phase 2 authorization boundary: global role assignments are readable only
-- for the authenticated user during the pre-tenant membership-selection context.
-- No write or permissive fallback policy is introduced here.
ALTER TABLE "GlobalRoleAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GlobalRoleAssignment" FORCE ROW LEVEL SECURITY;

CREATE POLICY "GlobalRoleAssignment_authenticated_user_selection"
  ON "GlobalRoleAssignment"
  FOR SELECT
  USING (
    public.app_membership_selection_context_is_valid()
    AND "userId" = current_setting('app.user_id', true)
  );
