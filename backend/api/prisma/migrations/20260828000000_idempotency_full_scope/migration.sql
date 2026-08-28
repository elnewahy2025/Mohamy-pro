-- Phase 2 idempotency full-scope schema.
-- The IdempotencyKey table is an internal, ephemeral cache (24h TTL) holding no
-- business data. At the time of this migration the real database contains 0 rows
-- in this table, so a controlled drop + recreate is safe and preserves nothing.
-- This aligns the table with the approved API_ENVELOPE_IDEMPOTENCY_DECISION:
-- non-sequential record id, scoped actor/tenant, method, normalized route,
-- request fingerprint, reservation state, sanitized response, replay headers,
-- attempt version, and a composite unique across the full idempotency scope.

-- The table is not RLS-protected (not in the tenant-table set); scope isolation
-- is enforced by the application through the scoped composite unique + service
-- verification, which is the documented compensating control.

DROP INDEX IF EXISTS "IdempotencyKey_expiresAt_idx";
DROP INDEX IF EXISTS "IdempotencyKey_tenantId_userId_idx";

DROP TABLE IF EXISTS "IdempotencyKey";

CREATE TYPE "IdempotencyState" AS ENUM ('RESERVED', 'COMPLETED', 'FAILED');

CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actorScope" TEXT,
    "tenantScope" TEXT,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "state" "IdempotencyState" NOT NULL DEFAULT 'RESERVED',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "responseHeaders" JSONB,
    "attemptVersion" INTEGER NOT NULL DEFAULT 0,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestId" TEXT,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyKey_scope_unique"
    ON "IdempotencyKey"("key", "actorScope", "tenantScope", "method", "route");

CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");
CREATE INDEX "IdempotencyKey_state_expiresAt_idx" ON "IdempotencyKey"("state", "expiresAt");
