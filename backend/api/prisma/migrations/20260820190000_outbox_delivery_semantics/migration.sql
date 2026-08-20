-- Additive outbox delivery metadata for retry, lease recovery, and dead-letter handling.
ALTER TABLE "OutboxMessage"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "deadLetteredAt" TIMESTAMP(3);

CREATE INDEX "OutboxMessage_status_availableAt_createdAt_idx"
  ON "OutboxMessage"("status", "availableAt", "createdAt");

CREATE INDEX "OutboxMessage_status_claimedAt_idx"
  ON "OutboxMessage"("status", "claimedAt");
