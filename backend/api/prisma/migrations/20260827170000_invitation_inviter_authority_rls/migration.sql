-- Allow token-bound acceptance to revalidate only the inviter membership's
-- tenant role assignments. The acceptance context and tenant boundary remain
-- required; target-member role assignments are not exposed by this policy.
CREATE POLICY "MembershipRole_acceptance_lookup"
  ON "MembershipRole"
  FOR SELECT
  USING (
    public.app_invitation_acceptance_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
    AND "membershipId" = current_setting('app.inviter_membership_id', true)
  );
