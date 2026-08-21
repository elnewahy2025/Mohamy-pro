# Phase 1 OpenTelemetry Runtime Evidence Plan

**Status:** Windows collector receipt verified; API-to-worker continuity and durable backend delivery remain explicitly bounded

## Current Boundary

The API and worker initialize OpenTelemetry only when an OTLP endpoint is configured. HTTP, PostgreSQL, Redis, and explicit outbox/queue context instrumentation is implemented, and W3C trace-context propagation is covered by unit tests. The current collector configuration receives OTLP over gRPC/HTTP and exports to a `tempo:4317` backend.

The Windows evidence now includes temporary collector debug-exporter receipt from both `mohamy-api` and `mohamy-worker`, including real worker/database spans. It does not include a backend query proving durable trace delivery, and the controlled event was inserted by direct SQL rather than an API request. Therefore, it cannot prove that an API request and downstream worker operation share the same parent/child trace. A successful application startup or a unit test of propagation remains insufficient by itself.

## Required Runtime Evidence

| Boundary | Required proof | Current status |
|---|---|---|
| API instrumentation | API starts with `OTEL_ENABLED=true` and a reachable OTLP HTTP endpoint; request creates a trace | Implemented and Windows runtime exercised |
| Collector receipt | Collector logs or metrics show a received span from `mohamy-api` | PASS; temporary verification collector evidence recorded |
| Worker propagation | A worker span contains the same trace identity or an equivalent parent/child relationship from the API/outbox job | W3C serialization unit-tested; real API-originated capture deferred until a mutation endpoint exists |
| Backend delivery | Tempo or the selected tracing backend can query the trace after collector export | Deployment gate open; current local Compose does not include a durable trace backend |
| Failure behavior | Collector outage is observable and does not leak secrets or block the API’s required health contract | Deployment re-entry test required; not executed in this evidence set |

## Evidence Boundary

A temporary collector using a debug receiver/exporter may prove collector receipt, but it must be labeled as a verification harness and must not replace the production collector-to-backend configuration. Production closure requires a real collector and backend delivery path, with retention policy and alerting ownership recorded.

## Terminal Boundary for the Windows Run

Before changing API/worker environment variables, rebuilding, or starting the collector verification harness, stop the Mohamy API and worker terminals with **Ctrl+C**. Keep PostgreSQL, Redis, MinIO, and any temporary collector/Tempo containers running. Do not stop, remove, recreate, or delete volumes for Health-ERP or Vision-ERP.

## Decision

The Windows Phase 1 observability status is **implementation and collector receipt verified with explicit scope limits**. No API-to-worker continuity, durable backend delivery, hosted retention, or alert-delivery claim is inferred from configuration presence, direct SQL, or unit tests. The remaining items are recorded in [`OBSERVABILITY_CLOSURE_DECISION.md`](OBSERVABILITY_CLOSURE_DECISION.md) with owners and re-entry gates.
