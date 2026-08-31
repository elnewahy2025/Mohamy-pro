-- APPROVED DESTRUCTIVE MIGRATION: Drop legacy orphan columns from IdempotencyKey.
--
-- Background: migration 20260828000000_idempotency_full_scope deliberately RETAINED
-- the init-era orphan columns (requestPath, userId, tenantId) to keep its rewrite
-- non-destructive, and explicitly documented that they "should be removed later in
-- a separately-approved, clearly destructive migration."
--
-- Approval basis (data-safety analysis, verified by live introspection at drafting
-- time):
--   * IdempotencyKey is an ephemeral 24h-TTL cache with no business data.
--   * The orphan columns are NOT part of the Prisma schema and are NEVER read or
--     written by the application; the app queries exclusively by "id".
--   * All three orphan columns are NULL in every row (verified: rp=0, uid=0, tid=0).
--     Their foreign keys therefore never enforce anything and their linked index is
--     unused.
--   * requestPath was NOT NULL in the DB but absent from the Prisma model, so every
--     idempotency insert violated the NOT NULL constraint (P2011 / 23502) and every
--     POST mutation failed with HTTP 500. This is the concrete failure this migration
--     resolves.
--
-- Before dropping the columns, the dependent foreign key constraints and the
-- legacy composite index must be removed first (Postgres forbids DROP COLUMN while
-- a foreign key references the column).
--
-- This migration is destructive to the three orphan columns only; it drops no table,
-- no business data, and no column the Prisma schema or application depends on.

-- 1. Drop the foreign key constraints that reference the orphan columns.
ALTER TABLE "IdempotencyKey"
  DROP CONSTRAINT IF EXISTS "IdempotencyKey_userId_fkey",
  DROP CONSTRAINT IF EXISTS "IdempotencyKey_tenantId_fkey";

-- 2. Drop the legacy index built on the orphan columns.
DROP INDEX IF EXISTS "IdempotencyKey_tenantId_userId_idx";

-- 3. Drop the orphan columns themselves.
ALTER TABLE "IdempotencyKey"
  DROP COLUMN IF EXISTS "requestPath",
  DROP COLUMN IF EXISTS "userId",
  DROP COLUMN IF EXISTS "tenantId";
