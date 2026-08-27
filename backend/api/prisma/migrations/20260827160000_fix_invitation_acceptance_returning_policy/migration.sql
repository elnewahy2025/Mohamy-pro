-- Permit token-bound acceptance updates to return the terminalized row.
-- The presented hash authorizes the existing row; the invalidated hash is only
-- available inside the validated acceptance transaction and authorizes the new
-- row after terminalization. Ordinary tenant isolation is unchanged.
ALTER POLICY "Invitation_acceptance_lookup"
  ON "Invitation"
  USING (
    public.app_invitation_acceptance_context_is_valid()
    AND (
      "tokenHash" = current_setting('app.invitation_token_hash', true)
      OR "tokenHash" = current_setting('app.invitation_invalidated_token_hash', true)
    )
  );
