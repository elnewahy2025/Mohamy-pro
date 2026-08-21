# Windows Observability Verification

**Verification date:** 2026-08-21

**Repository commits under test:** `23f83f6c` metrics-route correction, `c5891e09` real outbox success-handler registration, and `8174559f` dedicated worker metrics endpoint.

## Automated Gates

The Windows verification output recorded the following results from the repository root:

| Gate | Result |
|---|---|
| Prisma migration deployment | PASS; four repository migrations found and no pending migrations remained on `mohamy_pro` at `localhost:55432`. |
| API build | PASS; `nest build` completed successfully. |
| API unit suite | PASS; 8 suites and 21 tests passed. |
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
| `mohamy_queue_depth` | `mohamy-application` queue reported waiting `0`, active `0`, completed `2`, failed `0`, delayed `0` after the success workflow. |
| `mohamy_readiness_status` | `redis`, `queue`, `postgres`, and `objectStorage` each reported `1`. |
| `mohamy_outbox_state_count` | `PENDING=0`, `PROCESSING=0`, `PROCESSED=1`, `FAILED=0`, and `DEAD_LETTER=0` were captured immediately after the successful outbox workflow and before cleanup. |
| `mohamy_worker_job_duration_seconds` | The API registry is process-local and does not expose worker samples. The dedicated worker scrape at `http://localhost:3002/metrics` returned `200` and captured `mohamy_worker_job_duration_seconds_count{job_name="outbox.dispatch"} 1`. |
| `mohamy_application_errors_total` | Family registered; no application error was recorded during this verification window. |

The metrics response also included standard process and Node.js runtime metrics. No request bodies, credentials, document contents, financial details, or privileged communication content appeared in the captured application metric labels.

## Outbox Success-Path Evidence

A uniquely identified `Health` row and `health.status.updated` outbox message were inserted into the Windows database. After dispatcher and worker processing, the outbox row was `PROCESSED` with `attempts=1` and a non-null `processedAt`; the Health row changed to `DEGRADED`. The generated rows were then uniquely eligible for cleanup. This verifies the real registered handler and persistence transition, not a mock or direct status update.

## Evidence Boundaries

This verification proves the current API metrics endpoint, database query instrumentation, queue/readiness/outbox gauges, separate worker metrics endpoint, API route registration, API startup, worker startup, readiness behavior, real outbox success path, and worker job histogram on Windows. It does not yet prove OpenTelemetry export to a reachable collector because the captured run used the local default with no collector evidence. Hosted Prometheus/Loki retention and Alertmanager delivery remain separate deployment gates.

The worker metrics evidence is also recorded in [`WORKER_METRICS_WINDOWS_VERIFICATION.md`](WORKER_METRICS_WINDOWS_VERIFICATION.md). Phase 1 remains open until all other documented blockers have current evidence or an explicit, risk-bearing deferral under the authoritative roadmap.
