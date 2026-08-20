-- Repair indexes omitted by the locally generated duplicate baseline migration.
-- This migration is forward-only and intentionally does not alter applied migration history.

CREATE INDEX IF NOT EXISTS "Health_createdAt_idx" ON "Health"("createdAt");

CREATE INDEX IF NOT EXISTS "OutboxMessage_status_createdAt_idx"
  ON "OutboxMessage"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "OutboxMessage_aggregateType_aggregateId_idx"
  ON "OutboxMessage"("aggregateType", "aggregateId");

CREATE INDEX IF NOT EXISTS "IdempotencyKey_expiresAt_idx"
  ON "IdempotencyKey"("expiresAt");

CREATE INDEX IF NOT EXISTS "IdempotencyKey_tenantId_userId_idx"
  ON "IdempotencyKey"("tenantId", "userId");
