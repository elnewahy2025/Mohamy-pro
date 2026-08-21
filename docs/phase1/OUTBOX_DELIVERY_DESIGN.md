# Finding 2 — Outbox and Queue Delivery Design

## Scope

This design fixes the current behavior in which the API claims outbox rows, enqueues a BullMQ job, and immediately marks the row `PROCESSED` before any worker executes the event. The corrected design separates enqueue acknowledgement from handler success and makes recovery behavior explicit.

Finding 1 remains open pending Windows database validation. This remediation uses additive schema changes only and does not reset the database, delete volumes, or modify unrelated Docker containers.

## Components

| Component | Responsibility |
|---|---|
| API process | Creates outbox rows inside business transactions and periodically claims eligible rows for queue submission. It never marks a row processed merely because a queue job was added. |
| BullMQ queue | Transfers an immutable outbox job reference and delivery metadata to the worker process. Queue job IDs are deterministic per outbox message. |
| Worker process | Runs as a separate Nest application context, consumes jobs, resolves a registered event handler, executes it, and acknowledges database success only after the handler completes. |
| Outbox repository/service | Owns atomic claim, stale-lease recovery, conditional success, retry, and dead-letter transitions. |
| Handler registry | Maps event types to explicit handlers. Unknown event types fail visibly and are retried/dead-lettered; they are never silently treated as successful. |

## State machine

The database retains a string status for compatibility, with the following controlled values:

| State | Meaning | Allowed next states |
|---|---|---|
| `PENDING` | Eligible for dispatch when `availableAt` is due. | `PROCESSING` |
| `PROCESSING` | Claimed by a dispatcher and carrying a lease. | `PROCESSED`, `PENDING`, `FAILED`, `DEAD_LETTER` |
| `FAILED` | The latest attempt failed and a retry time is recorded. | `PROCESSING`, `DEAD_LETTER` |
| `PROCESSED` | The registered handler completed successfully. Terminal. | None |
| `DEAD_LETTER` | Maximum attempts were exhausted or an explicitly terminal failure occurred. Terminal until an operator performs a reviewed replay operation. | None in the automatic path |

`attempts` increments atomically when a row is claimed. `claimedAt` identifies the current lease, `availableAt` controls retry eligibility, `lastError` stores the redacted failure message, and `processedAt` is written only on successful handler completion.

## Delivery sequence

1. A business transaction writes its domain change and the outbox row in the same PostgreSQL transaction.
2. The API dispatcher recovers leases older than the configured lease interval and atomically claims due `PENDING` or retryable `FAILED` rows using `FOR UPDATE SKIP LOCKED`.
3. The dispatcher submits one BullMQ job with deterministic ID `outbox:<message-id>`.
4. If submission fails, the row is conditionally transitioned from `PROCESSING` to `FAILED` or `DEAD_LETTER` with backoff metadata.
5. The worker receives the job, loads the outbox row, and returns success immediately if it is already `PROCESSED` or `DEAD_LETTER`.
6. For a current `PROCESSING` row, the worker resolves the event handler and executes it. The handler must be idempotent because queue delivery is at-least-once.
7. Only after the handler returns successfully does the worker conditionally transition the row to `PROCESSED` and set `processedAt`.
8. A handler failure records a redacted error and schedules another attempt or moves the row to `DEAD_LETTER` after the configured maximum.
9. If the worker or API process stops after claiming a row, the lease-recovery pass returns the stale row to retryable delivery without deleting it.

## Retry policy

The default maximum is five attempts. Retry delay is bounded exponential backoff with jitter: `min(5 minutes, 1 second × 2^(attempt - 1)) + random jitter`. The policy is implemented in application code so database state and queue state remain consistent. Errors are truncated to a safe length and must not include payload contents, credentials, or tokens.

A worker job itself is not allowed to create an unbounded retry loop. The database outbox row is the source of truth for retry count and terminal state. BullMQ may redeliver a job after a crash, but conditional database transitions and idempotent handlers make that safe.

## Idempotency rules

The outbox message ID is the delivery identity. Every handler must treat repeated execution of the same message ID as safe. The worker must check terminal state before invoking a handler and must use a conditional `WHERE status = 'PROCESSING'` update when recording success. A duplicate worker cannot move a processed row backward or overwrite its completion timestamp.

## Operational signals

The worker exposes startup and shutdown logs, queue lifecycle events, successful and failed delivery counts, current active jobs, oldest pending outbox age, retry count, and dead-letter count. Readiness must distinguish queue connectivity from worker liveness. A queue connection alone is not evidence that an outbox consumer is running.

## Failure boundaries

The system must fail closed for unknown event types, unavailable Redis, unavailable PostgreSQL, handler exceptions, and malformed job payloads. It must not mark a message processed to suppress an error. Manual replay of a dead-lettered message is outside the automatic path and requires a separate reviewed operation with operator authorization and a new idempotency decision.

## References

1. [`Phase 1 audit report`](AUDIT_REPORT.md)
2. [`Phase 1 remediation plan`](PHASE1_REMEDIATION_PLAN_DETAILED.md)
3. [`Current outbox service`](../../backend/api/src/infrastructure/outbox/outbox.service.ts)
4. [`Current outbox dispatcher`](../../backend/api/src/infrastructure/outbox/outbox.dispatcher.ts)
5. [`Current queue service`](../../backend/api/src/infrastructure/queue/queue.service.ts)
6. [`Current Prisma schema`](../../backend/api/prisma/schema.prisma)
