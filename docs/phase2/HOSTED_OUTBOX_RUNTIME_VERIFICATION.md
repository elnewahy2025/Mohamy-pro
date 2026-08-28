# Phase 2 Hosted Outbox Runtime Verification

**Date:** 2026-08-28

**Repository revision:** current working tree of `Mohamy-Backup` (elnewahy2025/Mohamy-Backup).

**Environment:** Linux sandbox. Runtime verification executed against **hosted Neon PostgreSQL 18.6** and **hosted Upstash Redis** (no local PostgreSQL/Docker/MinIO). The outbox dispatcher (DB poller) and the BullMQ worker (queue consumer) were run as separate processes against the hosted services, mirroring the intended production topology: the API/app process hosts the `OutboxDispatcher` poller, and the standalone worker process hosts the BullMQ `OutboxWorker` consumer.

## Purpose

Produce runtime (database- + queue-gated) evidence that the outbox delivery pipeline actually processes messages end-to-end against the hosted infrastructure: dispatch (claim + enqueue) → queue transport (BullMQ on Upstash) → delivery (attempts, retry/backoff, lease expiry, dead-letter) → idempotent duplicate handling. This closes the "outbox/db runtime check" condition from the Phase 2 plan.

## Architecture verified

- **Dispatcher poller** (`OutboxDispatcher`, `@Interval(5000)`): periodically calls `OutboxService.dispatchBatch()` — claims due `PENDING`/expired-lease `OutboxMessage` rows in Neon (DB transaction) and enqueues an `outbox.dispatch` BullMQ job on `mohamy-application`.
- **Worker consumer** (`OutboxWorker`, BullMQ `Worker`): consumes `mohamy-application` jobs, re-fetches the message by id, requires a `PROCESSING` lease, resolves a handler by `eventType`, and on success marks `PROCESSED`; on handler failure records a retry/backoff or dead-letter state.
- Both processes connect to the same hosted Upstash Redis for the queue.

## Tooling fix required

The verifier's `redisConnection(url)` helper built a plain (non-TLS) BullMQ connection with the default `maxRetriesPerRequest: 20`, which **Upstash rejects** (`ECONNRESET` / "Reached the max retries per request limit"). This is a Redis-tooling compatibility fix, not an application behavior change. The helper now:

- enables TLS (`tls: {}`) when the URL uses the `rediss:` scheme,
- sets `enableOfflineQueue: false`,
- sets `maxRetriesPerRequest: null`.

The application's own `RedisService` already connects via the `rediss://` URL (auto-TLS) and started cleanly against Upstash without any code change.

## Isolation between processes

- Dispatcher process: a temporary bootstrap context (compiled from the repo's real `OutboxModule`, `QueueModule`, `RedisModule`, `DatabaseModule`, `MetricsModule` + `OutboxDispatcher` + `ScheduleModule.forRoot()`). It ran, polled, submitted messages, then was terminated and its source/dist removed — it is **not part of the repository**.
- Worker process: the production `worker.ts` → `WorkerModule` bootstrap, run unmodified.
- The verifier (`scripts/outbox-advanced-runtime-check.mjs`) inserts throwaway rows under `id LIKE 'phase1-%'` and removes them in cleanup.

## Command sequence executed

Working directory: `backend/api`. `DATABASE_URL` (Neon, sslmode=require) and `REDIS_URL` (Upstash, rediss://) were exported from the gitignored `backend/api/.env`; connection strings are not printed or stored here.

```text
# 1. Worker (production WorkerModule) — BullMQ consumer
DATABASE_URL=... REDIS_URL=... node dist/src/worker.js &
# log: "Redis connection established" / "Queue mohamy-application is ready"
#      "Outbox worker is ready on mohamy-application" / "Outbox worker process started"

# 2. Dispatcher poller (temporary bootstrap, real OutboxDispatcher + ScheduleModule)
DATABASE_URL=... REDIS_URL=... node dist/src/_tmp_dispatcher_bootstrap.js &
# log: "Temp dispatcher running (polling every 5s)"
#      "OutboxDispatcher Submitted 1/2 outbox message(s) to the worker queue"

# 3. Runtime verifier
DATABASE_URL=... REDIS_URL=... node scripts/outbox-advanced-runtime-check.mjs
```

## Results

BullMQ ↔ Upstash smoke test (trivial job round-trip) before the full run:

```text
JOB_RESULT: {"done":42}
```

Full outbox advanced runtime check (dispatcher + worker running):

```text
retry_backoff_status=PASS|first_available_at_future=true|delay_ms=931|second_attempts=2
lease_expiry_status=PASS|reclaimed_attempts=2|final_status=FAILED
duplicate_delivery_status=PASS|job_states=completed,completed|processed_attempts=1
outbox_cleanup_remaining=0
outbox_advanced_result=PASS
```

Supporting process logs captured during the check:

```text
[OutboxDispatcher] Submitted 1 outbox message(s) to the worker queue
[OutboxDispatcher] Submitted 1 outbox message(s) to the worker queue
[OutboxDispatcher] Submitted 2 outbox message(s) to the worker queue
[OutboxWorker] Outbox handler failed; retry or dead-letter state recorded
[OutboxWorker] Completed outbox job ...lease-...-attempt-2
[OutboxWorker] Completed outbox job ...duplicate-...-a
[OutboxWorker] Completed outbox job ...duplicate-...-b
```

Post-check residue confirmation against Neon (throwaway rows removed by the verifier):

```text
SELECT count(*) FROM "OutboxMessage" WHERE "id" LIKE 'phase1-%';  ->  0
```

All worker/dispatcher/API processes were stopped; no outbox test rows remain.

## Cleanup note

The temporary dispatcher bootstrap (`src/_tmp_dispatcher_bootstrap.ts` and its compiled `dist/src/_tmp_dispatcher_bootstrap.js`) was deleted after the run and is not part of the repository working tree (`git status` shows only the verifier script change). The only repository modification in this workstream is the Redis URL compatibility fix in `scripts/outbox-advanced-runtime-check.mjs`.

## Baseline decision

The outbox delivery pipeline is **runtime-verified PASS against hosted Neon PostgreSQL + hosted Upstash Redis**: dispatch → BullMQ transport → delivery → retry/backoff → lease-expiry reclamation → dead-lettering → idempotent duplicate handling all confirmed, with zero residue. This closes the "outbox/db runtime check" condition from `PHASE2_IMPLEMENTATION_PLAN.md`.

Scope: outbox delivery semantics over the queue. Phase 2 features (authentication with the hosted OIDC provider, authorization engine, sessions, membership switching, audit persistence, frontend identity) remain to be implemented and are tracked separately.
