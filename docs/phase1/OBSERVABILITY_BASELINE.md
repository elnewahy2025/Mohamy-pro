# Observability Baseline

Phase 1 establishes a minimal operational contract that can be used before the platform has domain-specific business metrics.

## Structured logs

The API uses `nestjs-pino` and emits structured request logs. Development uses `pino-pretty`; production uses JSON output. Authorization headers, cookies, API keys, and set-cookie response headers are redacted before logging.

## Correlation IDs

Every request receives an `x-correlation-id` response header. An incoming non-empty `x-correlation-id` is preserved; otherwise the API generates a UUID. The identifier is available to request logging and standardized error responses. It is also bound to async-local request context and copied into queue job metadata. OpenTelemetry W3C trace context is copied into the same metadata and extracted by the worker.

## Metrics and tracing

The protected `/api/metrics` endpoint exposes Prometheus request count and duration, database query duration and errors, queue depth, outbox state count, worker job duration, application errors, and dependency readiness. Labels are bounded to methods, route templates, status codes, fixed operation categories, fixed queue states, fixed outbox states, fixed dependency names, and fixed error categories.

The API and worker initialize OpenTelemetry before importing their Nest modules when `OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT` is configured. Automatic instrumentation covers HTTP, PostgreSQL, and ioredis boundaries; explicit spans cover outbox dispatch and worker processing. Active trace and span IDs are included in structured logs without request bodies or secrets.

## Health probes

The API exposes the following versioned endpoints behind the global `/api` prefix:

| Endpoint | Purpose | Dependency behavior |
|---|---|---|
| `/api/v1/health/live` | Process liveness | Does not require PostgreSQL, Redis, queue, or object storage. |
| `/api/v1/health/ready` | Dependency readiness | Checks PostgreSQL, Redis, BullMQ, and the private object-storage bucket. |
| `/api/v1/health` | Aggregate readiness response | Returns the same readiness contract. |

Readiness returns HTTP 200 only when every required dependency is up; otherwise it returns HTTP 503 and reports only bounded error names, never raw infrastructure messages or credentials.

## API documentation

OpenAPI JSON is available at `/api/docs-json`, and the interactive documentation is available at `/api/docs` when the API is running. The API is versioned by URI and the first stable prefix is `/api/v1`.

## Deployment and future-phase boundaries

Phase 1 provides the application telemetry contracts and deployment configuration, but no hosted Prometheus, Loki, OpenTelemetry Collector, or Alertmanager run has been executed in the sandbox. The effective retention and alert-routing settings require Windows deployment evidence. The exact retention and ownership boundary is recorded in [`docs/phase1/RETENTION_POLICY.md`](RETENTION_POLICY.md), and critical rules are recorded in [`docs/phase1/ALERTING_BASELINE.md`](ALERTING_BASELINE.md).

The authoritative plan assigns the audit foundation to Phase 2/3 and the complete audit, retention, and legal-hold product to Phase 30. Phase 1 does not misrepresent operational telemetry as immutable business audit history or security-event persistence. Those future-phase items remain explicit blockers for their respective phase closure, not silent omissions from this baseline.
