-- Phase 2 authentication session boundary.
-- Additive only: existing sessions remain valid records; new CSRF secrets
-- are encrypted by the application and stored in this nullable column.
ALTER TABLE "AppSession"
  ADD COLUMN IF NOT EXISTS "csrfTokenCiphertext" TEXT;
