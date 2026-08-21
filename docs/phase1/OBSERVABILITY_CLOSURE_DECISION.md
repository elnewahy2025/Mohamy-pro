# Phase 1 Observability Closure Decision

**Decision date:** 2026-08-21

**Scope:** Prometheus metrics, OpenTelemetry collector receipt, API-to-worker trace continuity, telemetry retention, alert routing, and collector-outage behavior under the approved Windows-Docker-only constraint.

## Decision Summary

Phase 1 observability implementation and Windows runtime evidence are closed for the controls that can be executed on the approved workstation. The remaining items are explicitly classified as **deployment-boundary or roadmap-owned verification**, not silently marked as passed and not replaced with mocks or workarounds.

The final Phase 1 decision therefore uses the governing wording:

> **Phase 1 implementation and Windows runtime gates closed; deployment production boundary open.**

This decision does not claim hosted Prometheus/Loki retention enforcement, Alertmanager delivery, a backend trace query, or API-originated API-to-worker parent/child continuity. The absence of those proofs is documented, assigned, and carried into the correct future acceptance gate.

## Evidence Matrix

| Requirement | Current evidence | Status | Owner | Target acceptance gate | Risk and acceptance impact |
|---|---|---|---|---|---|
| API Prometheus metrics | Protected `/api/metrics` returned HTTP 200 with required bounded metric families and live PostgreSQL, Redis/queue, readiness, outbox, and application signals on Windows. | `PASS` | API/observability owner | Phase 1 Windows runtime closure | No implementation gap remains for the API scrape surface. |
| Worker Prometheus metrics | Dedicated worker endpoint `http://localhost:3002/metrics` returned HTTP 200 with a real worker job-duration histogram. | `PASS` | Worker/observability owner | Phase 1 Windows runtime closure | No implementation gap remains for the worker scrape surface. |
| Metrics authorization and label safety | Production authorization behavior, bounded labels, and privacy-safe captured output are documented and unit-tested. | `PASS` | API/security owner | Phase 1 Windows runtime closure | Unbounded labels or secret-bearing metric content remain release blockers if introduced later. |
| Collector receipt from API | Temporary pinned collector debug exporter received resources with `service.name=mohamy-api`. | `PASS WITH HARNESS SCOPE` | API/observability owner | Phase 1 Windows runtime closure | Proves receipt, not durable backend storage or hosted retention. |
| Collector receipt from worker | Temporary pinned collector debug exporter received `service.name=mohamy-worker` and real worker/database spans. | `PASS WITH HARNESS SCOPE` | Worker/observability owner | Phase 1 Windows runtime closure | Proves receipt, not durable backend storage or hosted retention. |
| API-to-worker parent/child continuity | W3C serialization/extraction is unit-tested. The Windows runtime event was inserted by direct SQL, not an API mutation, so the run cannot establish an API-originated parent/child relationship. | `DOCUMENTED SCOPE DEFERRAL` | Phase 2 API/mutation owner | First real state-changing API endpoint and its integration test | No Phase 1 mutation endpoint exists; claiming continuity now would be false. The first mutation endpoint must capture API request, outbox enqueue, worker processing, and same-trace identity. |
| Trace backend delivery/query | The temporary collector used a debug exporter; no durable Tempo/backend query is part of the Windows evidence. | `DEPLOYMENT GATE OPEN` | Deployment/operations owner | First supported production observability deployment | Without backend delivery, traces cannot be retained or queried operationally. This blocks an unqualified production deployment claim, not the application instrumentation closure. |
| Operational log retention | Loki is configured for 30 days (`720h`), and privacy-safe structured logging is implemented. | `CONFIGURED; RUNTIME NOT EXECUTED` | Deployment/operations owner | First supported production observability deployment | Effective retention must be verified from the running Loki deployment; configuration alone is not enforcement evidence. |
| Prometheus metric retention | Prometheus configuration is present and the required process setting is 90 days. | `CONFIGURED; RUNTIME NOT EXECUTED` | Deployment/operations owner | First supported production observability deployment | Effective retention must be verified from the running Prometheus status endpoint. |
| Critical alert rules | `MohamyApiDown`, `MohamyReadinessFailing`, and `MohamyQueueBacklogHigh` rules and bounded signal contracts are committed. | `CONFIGURED` | Deployment/operations owner | First supported production observability deployment | Rules without a running evaluator and routing path do not prove notification. |
| Alert routing and delivery | Alertmanager/PagerDuty/email/chat delivery was not executed under the approved Windows-Docker evidence run. | `DEPLOYMENT GATE OPEN` | Deployment/operations owner | First supported production observability deployment | No page-delivery claim is made. The deployment must execute one controlled verification per critical rule without touching unrelated ERP containers or the primary production database. |
| Collector outage behavior | Application instrumentation is designed to be optional and health endpoints are independent, but a Windows runtime outage test was not retained in this Phase 1 evidence set. | `UNVERIFIED DEPLOYMENT CHECK` | API/observability owner with deployment/operations | First supported production observability deployment | An outage must not leak secrets or block the required health contract; this must be demonstrated before an unqualified production claim. |
| Audit and security-event retention | Phase 1 does not implement the seven-year business-audit or security-event persistence product. | `DEFERRED BY AUTHORITATIVE ROADMAP` | Phase 2/3 audit/security owners | Phase 2/3 audit foundation; Phase 30 retention product | Substituting ordinary logs would violate the Phase 0 policy; no such substitution is made. |

## Why These Deferrals Are Not Hidden Gaps

The Phase 1 API is read-only and has no state-changing endpoint that could produce a real API-originated outbox event. The API-to-worker continuity test therefore cannot be honestly completed without inventing a producer or using a direct database shortcut as if it were an API workflow. The direct-SQL run is retained as collector-receipt evidence only, exactly as recorded in [`OTEL_WINDOWS_VERIFICATION.md`](OTEL_WINDOWS_VERIFICATION.md).

Hosted retention, durable trace querying, and alert delivery require a running observability backend and operational notification route. The approved constraint excludes paid cloud services, a Linux or Kubernetes host, and an additional persistent machine. The Windows-Docker run can prove application controls and isolated runtime behavior, but it cannot be promoted to a highly available production object-storage/key-management deployment. This is the governing deployment boundary, not an implementation defect.[^1]

## Re-entry Gates

The following gates are mandatory when their owning scope becomes available:

| Re-entry event | Required evidence |
|---|---|
| First state-changing API endpoint | Real API request trace, transactional outbox enqueue, worker processing, and verified W3C trace identity relationship. |
| First supported production observability deployment | Effective Loki and Prometheus retention, durable trace backend query, authorized metrics scrape, and one controlled verification for each critical alert rule. |
| Collector outage test | API and worker behavior with an unreachable collector, no credential/payload leakage, and health endpoints retaining their required contract. |
| Phase 2/3 audit foundation | Append-only audit/security event persistence with authorization, retention ownership, and database evidence. |

## Acceptance Impact

This decision closes the **Phase 1 implementation and Windows runtime gates** for observability metrics, collector receipt, privacy-safe telemetry, and the application instrumentation currently in scope. It does not close the supported production deployment boundary. The project owner approved Option B in [`../phase2/PHASE2_ENTRY_DECISION.md`](../phase2/PHASE2_ENTRY_DECISION.md), so Phase 2 may begin implementation under the qualified Windows-Docker development boundary. Durable backend delivery, hosted retention/alert routing, API-originated continuity after the first mutation endpoint, and the future Linux KMS/object-storage production gate remain mandatory re-entry conditions for an unqualified production claim.

## References

[^1]: [`WINDOWS_DOCKER_CLOSURE_BOUNDARY.md`](WINDOWS_DOCKER_CLOSURE_BOUNDARY.md), the governing Windows-Docker-only deployment decision.

- [`OTEL_WINDOWS_VERIFICATION.md`](OTEL_WINDOWS_VERIFICATION.md)
- [`OTEL_RUNTIME_EVIDENCE_PLAN.md`](OTEL_RUNTIME_EVIDENCE_PLAN.md)
- [`OBSERVABILITY_WINDOWS_VERIFICATION.md`](OBSERVABILITY_WINDOWS_VERIFICATION.md)
- [`RETENTION_POLICY.md`](RETENTION_POLICY.md)
- [`ALERTING_BASELINE.md`](ALERTING_BASELINE.md)
- [`ACCEPTANCE_REPORT.md`](ACCEPTANCE_REPORT.md)
- [`GAP_ANALYSIS.md`](GAP_ANALYSIS.md)
