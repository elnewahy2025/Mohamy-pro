# Phase 1 Outbox Success-Path Baseline

## Registered Production Handler

The global `OutboxModule` registers `HealthStatusOutboxHandler` for the concrete event type `health.status.updated`. The handler validates the event payload and updates the persisted `Health` row through Prisma. This is a production handler, not a test-only mock or a no-op success stub.

The outbox worker resolves the handler, invokes it while the message is leased in `PROCESSING`, and calls `markProcessed` only after the handler completes successfully. A missing handler, invalid payload, database failure, or stale lease follows the existing failure/retry/dead-letter path.

## Success Contract

| Stage | Expected state/effect |
|---|---|
| Producer creates `OutboxMessage` | `status=PENDING`, `eventType=health.status.updated`, payload identifies a real `Health` row. |
| Dispatcher claims message | `status=PROCESSING`, `attempts` increments, lease token is assigned, BullMQ job is submitted. |
| Worker resolves handler | `HealthStatusOutboxHandler` validates payload and persists the requested status. |
| Handler succeeds | Outbox service atomically marks the leased message `PROCESSED` and sets `processedAt`. |
| Handler fails | Outbox service records bounded failure text and schedules retry or `DEAD_LETTER` at the attempt limit. |

## Repository Evidence

The handler unit tests cover valid persistence and malformed-payload rejection. The complete API build, Prisma generation, ESLint, and 9 unit suites with 23 tests passed after registration. Windows runtime evidence now shows a uniquely identified event reaching `PROCESSED` with `attempts=1` and a non-null `processedAt`, while the target Health row changed to `DEGRADED`. The generated test rows still require the documented cleanup verification.

## Runtime Verification Boundary

The Windows runtime test used a uniquely identified `Health` row and `OutboxMessage`, allowed the existing API dispatcher and dedicated worker to process the event, and queried both rows. The expected evidence was obtained: `OutboxMessage.status=PROCESSED`, `attempts=1`, a non-null `processedAt`, and `Health.status=DEGRADED`. Cleanup must remove only those uniquely identified test rows and verify both counts are zero. The test must not edit `_prisma_migrations`, reset the database, remove volumes, or touch unrelated containers.
