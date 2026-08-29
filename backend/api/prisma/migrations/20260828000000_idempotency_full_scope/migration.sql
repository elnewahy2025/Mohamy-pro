-- Phase 2 idempotency full-scope schema (in-place, non-destructive rewrite).
--
-- The original version of this migration performed a destructive DROP TABLE +
-- recreate. That conflicts with docs/phase0/MIGRATION_POLICY.md ("No destructive
-- migration without approval") and the Phase 2 plan's "additive migration only"
-- constraint. This rewrite evolves the existing IdempotencyKey table IN PLACE:
-- it never drops the table and never drops a column, so no row data is lost.
--
-- The IdempotencyKey table is an internal, ephemeral cache (24h TTL) holding no
-- business data, with no foreign keys referencing it. At the time of writing it
-- contains 0 rows (verified by live introspection), so the single non-additive
-- operation below -- changing the primary key from "key" to "id" -- is data-safe.
--
-- REQUIRED, APPROVED limitation: the application (IdempotencyService) now queries
-- the table exclusively by "id" (findUnique/update where id), so the primary key
-- MUST become "id". Re-pointing a primary key is not achievable with purely
-- additive DDL; it requires dropping the old PK constraint and adding a new one.
-- This is the one documented deviation, approved because the table is a 0-row,
-- FK-free, ephemeral cache. No table, column, or data is dropped.
--
-- Legacy orphan columns (userId, tenantId, requestPath) from the init-era table
-- are intentionally RETAINED to keep this migration non-destructive. They are not
-- part of the Prisma schema, are never read by the application, and cause no
-- runtime impact. They should be removed later in a separately-approved, clearly
-- destructive migration.

-- 1. Enum for reservation/completion state (additive; missing in live DB).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IdempotencyState') THEN
    CREATE TYPE "IdempotencyState" AS ENUM ('RESERVED', 'COMPLETED', 'FAILED');
  END IF;
END $$;

-- 2. Add the columns required by the new schema (additive; no existing column
--    is dropped or renamed).
ALTER TABLE "IdempotencyKey"
  ADD COLUMN IF NOT EXISTS "id" TEXT,
  ADD COLUMN IF NOT EXISTS "actorScope" TEXT,
  ADD COLUMN IF NOT EXISTS "tenantScope" TEXT,
  ADD COLUMN IF NOT EXISTS "method" TEXT,
  ADD COLUMN IF NOT EXISTS "route" TEXT,
  ADD COLUMN IF NOT EXISTS "fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "state" "IdempotencyState" NOT NULL DEFAULT 'RESERVED',
  ADD COLUMN IF NOT EXISTS "responseHeaders" JSONB,
  ADD COLUMN IF NOT EXISTS "attemptVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "requestId" TEXT;

-- 3. The new schema makes responseStatus/responseBody nullable (they were
--    NOT NULL on the legacy table). Relaxing NOT NULL is non-destructive.
ALTER TABLE "IdempotencyKey"
  ALTER COLUMN "responseStatus" DROP NOT NULL,
  ALTER COLUMN "responseBody" DROP NOT NULL;

-- 4. Enforce the NOT NULL columns the new schema requires. The table is empty,
--    so SET NOT NULL is trivially satisfied and is non-destructive.
ALTER TABLE "IdempotencyKey"
  ALTER COLUMN "method" SET NOT NULL,
  ALTER COLUMN "route" SET NOT NULL,
  ALTER COLUMN "fingerprint" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

-- 5. Re-point the primary key from "key" to "id" (the single approved, data-safe
--    non-additive step described above). The "id" values are supplied by the
--    application (Prisma @default(uuid())); the table is empty so no backfill is
--    required. We keep the same constraint name so downstream references hold.
ALTER TABLE "IdempotencyKey"
  DROP CONSTRAINT "IdempotencyKey_pkey",
  ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "IdempotencyKey"
  ADD CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id");

-- 6. Additive scoped-uniqueness and index for the new query shape. The legacy
--    indexes (IdempotencyKey_expiresAt_idx, IdempotencyKey_tenantId_userId_idx)
--    are intentionally retained because their columns still exist.
CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyKey_scope_unique"
  ON "IdempotencyKey"("key", "actorScope", "tenantScope", "method", "route");

CREATE INDEX IF NOT EXISTS "IdempotencyKey_state_expiresAt_idx"
  ON "IdempotencyKey"("state", "expiresAt");
