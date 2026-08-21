# Phase 1 Alerting Baseline

**Status:** Alert rules and signal contracts are defined; hosted routing verification remains a deployment gate.

**Governing source:** [`docs/phase0/OBSERVABILITY.md`](../phase0/OBSERVABILITY.md).

## Critical Rules

The canonical rules are stored in [`infrastructure/observability/prometheus/mohamy-alerts.yml`](../../infrastructure/observability/prometheus/mohamy-alerts.yml) and loaded by [`infrastructure/observability/prometheus/prometheus.yml`](../../infrastructure/observability/prometheus/prometheus.yml).

| Alert | Signal | Threshold and duration | Intended response |
|---|---|---|---|
| `MohamyApiDown` | Prometheus `up{job="mohamy-api"}` | `0` for 5 minutes | Page the API owner; verify process, readiness, network, and collector/metrics authorization. |
| `MohamyReadinessFailing` | `mohamy_readiness_status` | Any declared dependency below `1` for 5 minutes | Page the platform owner; identify PostgreSQL, Redis, queue, or object-storage failure before accepting traffic. |
| `MohamyQueueBacklogHigh` | Waiting plus delayed `mohamy_queue_depth` | More than 100 jobs for 10 minutes | Page the worker owner; inspect worker health, outbox leases, retry rate, and downstream availability. |

## Signal Contract

The API exposes bounded metrics for request count and duration, database query duration and errors, queue depth, outbox state counts, worker job duration, application errors, and dependency readiness. No alert rule depends on a high-cardinality identifier, document content, request path value, user identifier, tenant identifier, or financial value.

The metrics endpoint is protected. A deployment must mount the Prometheus bearer token at `/etc/prometheus/secrets/metrics_token` and configure the API with the same secret through `METRICS_AUTH_TOKEN`. A production API without an authorized scrape is not considered observable, even if the process itself is healthy.

## Routing Boundary

Alertmanager, PagerDuty, email, chat, escalation schedules, ownership rotation, and maintenance silences are deployment-environment responsibilities. Phase 1 provides the rules and the signal contract; it does not claim that a page was delivered because no hosted Alertmanager run was available in the sandbox.

The release gate requires one controlled verification for each rule: stop or isolate the API to prove `MohamyApiDown`, make a dependency fail to prove `MohamyReadinessFailing`, and create a sustained queue backlog in a disposable environment to prove `MohamyQueueBacklogHigh`. These tests must not be performed against the user’s production database or unrelated Health-ERP/Vision-ERP containers.

## Rollback and Mitigation

Alert-rule changes are configuration-only and can be rolled back by reverting the Prometheus rule file and reloading Prometheus. Application metric-name or label changes require coordinated rule updates; metric labels must remain bounded and backward-compatible during a rollout. If telemetry is unavailable, readiness and application health remain independent signals and the deployment must be treated as observability-degraded rather than silently accepted.
