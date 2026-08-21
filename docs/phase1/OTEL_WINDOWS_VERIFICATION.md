# Windows OpenTelemetry Verification

**Status:** Windows collector receipt verified; API-to-worker continuity and durable backend delivery remain unverified

**Date:** 2026-08-21

## Runtime Setup

The Windows verification used a temporary pinned `otel/opentelemetry-collector-contrib:0.157.0` container with the repository’s verification-only collector configuration. OTLP HTTP was exposed on host port `54318`. A temporary API process used service name `mohamy-api`; a temporary worker process used service name `mohamy-worker`.

The existing PostgreSQL, Redis, and MinIO containers remained running. The primary Compose file and unrelated Health-ERP/Vision-ERP containers were not changed.

## Executed Evidence

The API readiness request returned `status=ok` and reported PostgreSQL, Redis, queue, and object storage as `up`. A uniquely identified `health.status.updated` outbox event was processed by the real worker with the following result:

```text
outbox_result=PROCESSED|1|2026-08-21"T"17:48:54.209
outbox_remaining=0
health_remaining=0
```

The collector debug exporter reported a worker resource with:

```text
service.name: Str(mohamy-worker)
resource spans: 1, spans: 14
```

The worker span context included the following trace ID and operations:

```text
Trace ID: 8999ad8fb0b3517345a0dcf959432f58
Name: dns.lookup
Name: tcp.connect
Name: pg.connect
Name: pg-pool.connect
```

The collector also reported API resources with `service.name: Str(mohamy-api)` and multiple trace IDs. This proves that the temporary collector received telemetry from both the API and worker processes.

## Boundary and Decision

The outbox event was inserted directly into PostgreSQL with SQL rather than being created by an API request. Consequently, this run proves collector receipt for both service streams and real worker/database instrumentation, but it does not prove that an API request’s trace ID is the parent of the worker trace. W3C queue serialization/extraction remains unit-tested; a real API-originated mutation-to-worker trace requires a state-changing producer endpoint, which does not exist in the Phase 1 read-only API.

The result is **Windows collector receipt verified with an explicit continuity and backend-delivery boundary**. No full API-to-worker trace-continuity claim is made. The collector and temporary API/worker processes were stopped after evidence collection; the verification rows were cleaned with both remaining counts equal to zero. The API-to-worker continuity, durable backend query, hosted retention, and alert-routing re-entry gates are consolidated in [`OBSERVABILITY_CLOSURE_DECISION.md`](OBSERVABILITY_CLOSURE_DECISION.md).

## Canonical References

- [`OTEL_RUNTIME_EVIDENCE_PLAN.md`](OTEL_RUNTIME_EVIDENCE_PLAN.md)
- [`OBSERVABILITY_REQUIREMENTS_AUDIT.md`](OBSERVABILITY_REQUIREMENTS_AUDIT.md)
- [`OBSERVABILITY_WINDOWS_VERIFICATION.md`](OBSERVABILITY_WINDOWS_VERIFICATION.md)
- [`OUTBOX_SUCCESS_PATH_BASELINE.md`](OUTBOX_SUCCESS_PATH_BASELINE.md)
