# Windows Observability Verification

**Verification date:** 2026-08-21

**Repository commits under test:** `23f83f6c` metrics-route correction and `e267a95e` acceptance-report reference update.

## Automated Gates

The Windows verification output recorded the following results from the repository root:

| Gate | Result |
|---|---|
| Prisma migration deployment | PASS; three repository migrations found and no pending migrations remained on `mohamy_pro` at `localhost:55432`. |
| API build | PASS; `nest build` completed successfully. |
| API unit suite | PASS; 6 suites and 15 tests passed. |
| API production startup | PASS; PostgreSQL, Redis, queue, object storage, MetricsModule, and Nest application initialized successfully. |
| Worker production startup | PASS; PostgreSQL, Redis, queue, OutboxWorker, and worker process reached ready state. |
| API readiness | PASS; `/api/v1/health/ready` returned HTTP 200 and all four dependencies reported `up`. |

## Metrics Endpoint

The API startup log mapped the route as version-neutral:

```text
MetricsController {/api/metrics} (version: Neutral)
Mapped {/api/metrics, GET} (version: Neutral) route
```

A Windows request to `GET http://localhost:3000/api/metrics` returned HTTP `200` with Prometheus content type `text/plain; charset=utf-8; version=0.0.4`.

The captured metric output contains the required families and live values:

| Metric family | Captured evidence |
|---|---|
| `mohamy_http_requests_total` | GET `/api/metrics` and `/api/v1/health/ready` recorded with status `200`. |
| `mohamy_http_request_duration_seconds` | Histograms recorded both requests, including counts and sums. |
| `mohamy_database_query_duration_seconds` | `select`, `update`, and `other` operation histograms recorded live PostgreSQL queries. |
| `mohamy_database_errors_total` | Family registered; no database errors were recorded during the verification window. |
| `mohamy_queue_depth` | `mohamy-application` queue reported waiting `0`, active `0`, completed `1`, failed `0`, delayed `0`. |
| `mohamy_readiness_status` | `redis`, `queue`, `postgres`, and `objectStorage` each reported `1`. |
| `mohamy_outbox_state_count` | `PENDING`, `PROCESSING`, `PROCESSED`, `FAILED`, and `DEAD_LETTER` each reported `0` at scrape time. |
| `mohamy_worker_job_duration_seconds` | Family registered; no worker job was executed during this particular scrape window. |
| `mohamy_application_errors_total` | Family registered; no application error was recorded during this verification window. |

The metrics response also included standard process and Node.js runtime metrics. No request bodies, credentials, document contents, financial details, or privileged communication content appeared in the captured application metric labels.

## Evidence Boundaries

This verification proves the current API metrics endpoint, database query instrumentation, queue/readiness/outbox gauges, API route registration, API startup, worker startup, and readiness behavior on Windows. It does not yet prove OpenTelemetry export to a reachable collector because the captured run used the local default with no collector evidence. It also does not prove hosted Prometheus/Loki retention, Alertmanager delivery, or the controlled worker-job histogram path; those remain separate deployment and workflow gates.

Phase 1 remains open until all other documented blockers have current evidence or an explicit, risk-bearing deferral under the authoritative roadmap.
