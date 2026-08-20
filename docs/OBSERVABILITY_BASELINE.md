# Observability Baseline

Phase 1 establishes a minimal operational contract that can be used before the platform has domain-specific business metrics.

## Structured logs

The API uses `nestjs-pino` and emits structured request logs. Development uses `pino-pretty`; production uses JSON output. Authorization headers, cookies, API keys, and set-cookie response headers are redacted before logging.

## Correlation IDs

Every request receives an `x-correlation-id` response header. An incoming non-empty `x-correlation-id` is preserved; otherwise the API generates a UUID. The identifier is available to request logging and standardized error responses.

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

## Current non-claims

Phase 1 does not claim distributed tracing, a metrics backend, centralized log storage, alert routing, encrypted backup retention, or an external uptime monitor. Those require deployment-environment decisions and belong in the later operations and compliance work.
