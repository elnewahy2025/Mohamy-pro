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

The handler unit tests cover valid persistence and malformed-payload rejection. The complete API build, Prisma generation, ESLint, and 8 unit suites with 21 tests passed after registration. A real Windows producer-to-dispatcher-to-worker workflow remains required because the current API surface has no business write endpoint that creates this event.

## Runtime Verification Boundary

The Windows runtime test must use a uniquely identified `Health` row and `OutboxMessage`, allow the existing API dispatcher and dedicated worker to process the event, query both rows, and remove only those uniquely identified test rows. It must not edit `_prisma_migrations`, reset the database, remove volumes, or touch unrelated containers. The expected evidence is `OutboxMessage.status=PROCESSED`, a non-null `processedAt`, and the target `Health.status` equal to the event payload status.
