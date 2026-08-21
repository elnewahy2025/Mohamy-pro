# Phase 1 OpenTelemetry Runtime Evidence Plan

**Status:** Open runtime gate; application instrumentation is implemented but collector delivery is not yet claimed

## Current Boundary

The API and worker initialize OpenTelemetry only when an OTLP endpoint is configured. HTTP, PostgreSQL, Redis, and explicit outbox/queue context instrumentation is implemented, and W3C trace-context propagation is covered by unit tests. The current collector configuration receives OTLP over gRPC/HTTP and exports to a `tempo:4317` backend.

The repository evidence does not yet include a collector log or backend query proving that an API request and a downstream worker operation were received under the same trace. A successful application startup or a unit test of propagation is not equivalent to collector delivery.

## Required Runtime Evidence

| Boundary | Required proof | Current status |
|---|---|---|
| API instrumentation | API starts with `OTEL_ENABLED=true` and a reachable OTLP HTTP endpoint; request creates a trace | Implemented; runtime capture open |
| Collector receipt | Collector logs or metrics show a received span from `mohamy-api` | Open |
| Worker propagation | A worker span contains the same trace identity or an equivalent parent/child relationship from the API/outbox job | W3C serialization unit-tested; real capture open |
| Backend delivery | Tempo or the selected tracing backend can query the trace after collector export | Open; current local Compose does not include Tempo |
| Failure behavior | Collector outage is observable and does not leak secrets or block the API’s required health contract | Open |

## Evidence Boundary

A temporary collector using a debug receiver/exporter may prove collector receipt, but it must be labeled as a verification harness and must not replace the production collector-to-backend configuration. Production closure requires a real collector and backend delivery path, with retention policy and alerting ownership recorded.

## Terminal Boundary for the Windows Run

Before changing API/worker environment variables, rebuilding, or starting the collector verification harness, stop the Mohamy API and worker terminals with **Ctrl+C**. Keep PostgreSQL, Redis, MinIO, and any temporary collector/Tempo containers running. Do not stop, remove, recreate, or delete volumes for Health-ERP or Vision-ERP.

## Decision

Until a collector-received API-to-worker trace and the selected backend query are captured, the Phase 1 observability status remains **partially verified**. No span-delivery claim will be inferred from configuration presence or unit tests.
