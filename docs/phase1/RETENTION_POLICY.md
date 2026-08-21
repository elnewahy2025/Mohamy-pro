# Phase 1 Retention Policy

**Status:** Foundation defined; deployment-runtime verification remains an explicit release gate.

**Governing source:** [`docs/phase0/OBSERVABILITY.md`](../phase0/OBSERVABILITY.md).

## Policy Matrix

| Telemetry class | Required retention | Phase 1 implementation | Owner and verification boundary | Status |
|---|---:|---|---|---|
| Operational logs | 30 days | Loki retention is configured as `720h` in [`infrastructure/observability/loki/loki-config.yml`](../../infrastructure/observability/loki/loki-config.yml). API logs remain structured through [`backend/api/src/observability/logger.module.ts`](../../backend/api/src/observability/logger.module.ts), with authorization, cookie, API-key, and set-cookie redaction. | Deployment must route JSON logs to the Loki deployment and verify a deletion boundary after 30 days. | CONFIGURED; runtime retention test NOT EXECUTED |
| Prometheus metrics | 90 days | Prometheus configuration is in [`infrastructure/observability/prometheus/prometheus.yml`](../../infrastructure/observability/prometheus/prometheus.yml) and must be started with `--storage.tsdb.retention.time=90d`. | Operations deployment owns the Prometheus process flag and must verify the effective retention value from the running Prometheus status endpoint. | CONFIGURED; runtime retention test NOT EXECUTED |
| Audit logs | 7 years | The Phase 1 foundation exposes telemetry and preserves the outbox/health auditability needed by later business events. The authoritative plan assigns the audit foundation to Phase 2/3 and the complete retention/legal-hold product to Phase 30. | Phase 2/3 must create the append-only audit event foundation. Phase 30 must implement jurisdiction- and tenant-configurable retention, archiving, legal hold, and compliant deletion. | DEFERRED BY AUTHORITATIVE PLAN; not a Phase 1 business-audit implementation |
| Security logs | 7 years | Phase 1 privacy-safe operational telemetry avoids secrets and confidential payloads. Security-event persistence is not silently substituted with normal application logs. The authoritative plan assigns security event logging to Phase 3. | Phase 3 must persist authentication, permission, and access-denial events to PostgreSQL/SIEM with the seven-year policy. | DEFERRED BY AUTHORITATIVE PLAN; not a Phase 1 security-event implementation |

## Application Controls

The API metrics endpoint is exposed at `/api/metrics`. It is loopback-only when no token is configured in development and requires a bearer token or `x-metrics-token` in production. `METRICS_ENABLED=false` makes the endpoint return `404`; production deployments must set `METRICS_AUTH_TOKEN` before enabling the scrape target.

OpenTelemetry is disabled when no `OTEL_EXPORTER_OTLP_ENDPOINT` is supplied. When enabled, the API and worker initialize automatic HTTP, PostgreSQL, and ioredis instrumentation before importing their Nest modules. BullMQ/outbox spans and correlation metadata are added by the application boundary. Production deployments must supply a reachable collector endpoint and verify that the collector receives spans from both processes.

## Privacy and Deletion Boundary

Operational telemetry may contain bounded method, route-template, status, dependency, queue-state, error-category, correlation, trace, and resource-identifier metadata. It must not contain passwords, API keys, JWTs, document contents, client financial details, privileged communications, request bodies, or arbitrary exception messages. The existing logger redaction remains mandatory, and the outbox worker now records bounded error messages rather than forwarding arbitrary handler text into logs.

Retention deletion must be performed by the telemetry backend or the later audit-retention service, never by ad hoc application queries. Legal holds and immutable audit history are not implemented in Phase 1 and must not be represented as implemented by this foundation.

## Release Evidence Required

Before a deployment is accepted as production-ready, operations must capture the effective Prometheus retention setting, the effective Loki retention setting, a collector-received API span, a collector-received worker span, and the authorization result for the metrics endpoint. Those deployment checks are not executable in the current sandbox because Docker is unavailable there; they remain Windows deployment verification items.
