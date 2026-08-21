# Mohamy Pro Phase 1 Foundation Gap Analysis

## Evidence rule

This document records only implementation and runtime results supported by repository inspection, executed tests, or captured Windows evidence. A green neighboring test does not prove an unexecuted workflow.

## Verified foundation

The monorepo contains the NestJS API under `backend/api`, the Next.js web application under `apps/web`, shared contracts under `packages/contracts`, and infrastructure under `infrastructure`. The API uses Prisma/PostgreSQL, Redis, BullMQ, MinIO through an S3-compatible adapter, URI versioning, OpenAPI, global validation, Helmet, Pino logging, correlation IDs, health checks, Prometheus metrics, OpenTelemetry instrumentation, W3C queue propagation, transactional outbox persistence/dispatch, and a dedicated worker entrypoint.

The local Mohamy services are isolated from Health-ERP and Vision-ERP. Verified host ports are PostgreSQL `55432`, Redis `56379`, MinIO API `59000`, and MinIO console `59001`.

## Status matrix

| Area | Status | Evidence-based assessment |
|---|---|---|
| Repository structure | `PASS` | API, web, shared contracts, infrastructure, migrations, tests, and Phase 1 documentation are present. |
| Repository migrations | `PASS WITH ACCEPTED LEGACY STATE` | The three repository migrations apply cleanly on a disposable database and `db:check` returns exit code 0 there. The existing Windows database retains an older applied migration absent from Git; it was not rewritten and is documented as legacy. |
| Redis, BullMQ, and worker startup | `PASS` | Production worker connected to PostgreSQL, Redis, queue, and outbox infrastructure and logged readiness. |
| Outbox enqueue and dead-letter path | `PASS` | A uniquely identified unknown event was submitted using a BullMQ-safe job ID, consumed by the real worker, moved to `DEAD_LETTER`, and removed; cleanup was verified with zero matching rows. |
| Outbox success path | `PASS` | [`OUTBOX_SUCCESS_PATH_BASELINE.md`](OUTBOX_SUCCESS_PATH_BASELINE.md) records Windows dispatcher-to-worker evidence: `PROCESSED`, `attempts=1`, non-null `processedAt`, `Health.status=DEGRADED`, and zero matching rows after cleanup. |
| Outbox advanced recovery | `PASS WITH GRACEFUL-SHUTDOWN GATE OPEN` | [`OUTBOX_ADVANCED_WINDOWS_VERIFICATION.md`](OUTBOX_ADVANCED_WINDOWS_VERIFICATION.md) records real retry-backoff, lease expiry, unique per-attempt IDs, duplicate delivery, and cleanup. Graceful shutdown remains the only unverified sub-gate. |
| API production startup | `PASS` | `dist/src/main.js` starts and connects to PostgreSQL, Redis, queue, and MinIO. The previous wildcard route warnings were removed. |
| Health and readiness | `PASS` | Windows production runtime returned HTTP 200 for liveness and readiness; all four dependencies reported `up`. |
| OpenAPI | `PASS` | `/api/docs-json` returned HTTP 200 with the current versioned routes. |
| Backup and restore smoke | `PASS` | Backup was created, restored into a temporary database, validated, and cleaned up without replacing the primary database. |
| Frontend foundation | `PASS WITH SCOPE LIMIT` | Next.js App Router, English/Arabic locale support, RTL/LTR direction, responsive layout, and accessibility foundations are present. Business workflows are outside this foundation scope. |
| Generated API client | `DOCUMENTED DEFERRAL` | [`GENERATED_CLIENT_DECISION.md`](GENERATED_CLIENT_DECISION.md) records why a client is not useful on the foundation-only API and defines the Phase 2 consumer gate. |
| HTTP idempotency integration | `DOCUMENTED DEFERRAL` | [`IDEMPOTENCY_DECISION.md`](IDEMPOTENCY_DECISION.md) records the implemented persistence helper, the current read-only route boundary, and the required real-consumer re-entry gate. |
| Basic object storage | `PASS WITH SCOPE LIMIT` | Bucket readiness, basic object operations, signed download URLs, and private access are implemented and readiness-tested. |
| Storage security controls | `PASS WITH WINDOWS-ONLY DEPLOYMENT SCOPE` | [`STORAGE_WINDOWS_VERIFICATION.md`](STORAGE_WINDOWS_VERIFICATION.md) records the applied migration, real isolated versioning, SHA-256/size metadata, observed `aws:kms`, Object Lock/legal-hold enforcement, clean ClamAV scanning, and fail-closed behavior. The Windows-only deployment boundary remains explicit. |
| Structured logging and correlation IDs | `PASS` | Production logs, correlation IDs, sensitive-header redaction, and runtime startup are evidenced. |
| Metrics and tracing | `PASS WITH EXPLICIT SCOPE LIMIT` | [`OBSERVABILITY_CLOSURE_DECISION.md`](OBSERVABILITY_CLOSURE_DECISION.md) and [`OTEL_WINDOWS_VERIFICATION.md`](OTEL_WINDOWS_VERIFICATION.md) record Windows API/worker metrics and collector receipt from both services, including real worker/database spans. API-originated parent/child continuity, durable backend delivery, hosted retention, and alert routing remain explicit re-entry gates. |
| Retention and alerting | `CONFIGURED; DEPLOYMENT RUNTIME OPEN` | [`OBSERVABILITY_CLOSURE_DECISION.md`](OBSERVABILITY_CLOSURE_DECISION.md), [`RETENTION_POLICY.md`](RETENTION_POLICY.md), and [`ALERTING_BASELINE.md`](ALERTING_BASELINE.md) define the retention and critical-alert contracts. Hosted enforcement and routing are explicitly deployment-owned gates; audit/security event persistence remains owned by later roadmap phases. |
| Input validation and security headers | `PASS` | Global validation, whitelist/forbid behavior, Helmet, CORS configuration, and redaction are implemented. |
| Rate limiting and CSRF | `RATE LIMIT PASS; CSRF N/A` | Redis-backed atomic rate limiting is unit-tested and Windows-verified with raw 200/200/429 headers and `Retry-After`. [`CSRF_DECISION.md`](CSRF_DECISION.md) records that the current read-only, non-cookie API has no applicable CSRF surface and defines the future re-entry gate. |
| Authentication and authorization | `DEFERRED BY ROADMAP` | Identity, membership, tenant isolation, RBAC/ABAC, and resource authorization belong to later phases and are not claimed here. |
| Hosted CI/security artifacts | `PASS` | [`HOSTED_CI_VERIFICATION.md`](HOSTED_CI_VERIFICATION.md) records successful quality, static security, container, and DAST jobs with retained coverage, SBOM, SARIF, and ZAP artifacts. |
| Local e2e | `PASS` | [`E2E_WINDOWS_VERIFICATION.md`](E2E_WINDOWS_VERIFICATION.md) records the Windows run against real PostgreSQL, Redis, and MinIO: 1 suite and 4 tests passed. |
| Architecture fitness | `ACCEPTED` | [`ARCHITECTURE_DECISIONS.md`](ARCHITECTURE_DECISIONS.md) records PostgreSQL 16, separate API/worker processes, and reserved `integrations/*` and `ai/*` scopes. |
| Documentation | `PASS` | [`FINAL_CLOSURE_REVIEW.md`](FINAL_CLOSURE_REVIEW.md) records zero broken Phase 1 relative links, stale-claim reconciliation, security scans, regression commands, complete changed-path review, and the exact final decision. |

## Remaining deployment and re-entry boundaries

The approved infrastructure constraint is Windows Docker only. [`WINDOWS_DOCKER_CLOSURE_BOUNDARY.md`](WINDOWS_DOCKER_CLOSURE_BOUNDARY.md) is the governing record: Windows can close genuine runtime and application-control gates, but a workstation-only single-host object-storage/key-management stack must not be represented as an unqualified production deployment.

1. Metrics and distributed tracing implementation plus Windows collector receipt are evidenced. API-originated trace continuity, durable backend delivery, hosted retention enforcement, and alert routing are explicit deployment or first-mutation re-entry gates documented in [`OBSERVABILITY_CLOSURE_DECISION.md`](OBSERVABILITY_CLOSURE_DECISION.md).
2. Storage-security controls and isolated Windows runtime behavior are evidenced for versioning, Object Lock, observed KMS encryption, and ClamAV clean/fail-closed scanning. The supported production deployment boundary remains explicitly unclaimable as an unqualified workstation-only production deployment under Windows Docker only.
3. The registered outbox success path, advanced retry/reclamation/duplicate workflows, cleanup, and graceful shutdown are evidenced on Windows; the shutdown evidence is user-reported rather than a retained terminal transcript.
4. HTTP idempotency is a documented deferral until a state-changing business endpoint exists; its real-consumer re-entry gate remains owned by the first mutation endpoint’s phase.
5. The legacy database state is accepted and documented, but the machine-local migration remains non-reproducible and must not be silently rewritten.
6. Final documentation cross-links and the consolidated Phase 1 closure review are closed in [`FINAL_CLOSURE_REVIEW.md`](FINAL_CLOSURE_REVIEW.md).

## Phase boundary

The final Phase 1 decision is **Phase 1 implementation and Windows runtime gates closed; deployment production boundary open**. The project owner approved Option B in [`../phase2/PHASE2_ENTRY_DECISION.md`](../phase2/PHASE2_ENTRY_DECISION.md), and the owner-approved preflight decision set plus corrected-plan re-audit in [`../phase2/PHASE2_PLAN_AUDIT.md`](../phase2/PHASE2_PLAN_AUDIT.md) authorize Phase 2 Identity and Multi-Tenancy implementation under the qualified Windows-Docker development boundary. All remaining observability, idempotency, audit, and deployment items have explicit owners, target re-entry gates, rationale, risk, and acceptance impact; they are not silently treated as passed. Phase 3 remains blocked until Phase 2 is fully implemented, tested, evidenced, and approved.

## Canonical references

- [`Phase 1 acceptance report`](ACCEPTANCE_REPORT.md)
- [`Detailed remediation plan`](PHASE1_REMEDIATION_PLAN_DETAILED.md)
- [`API and worker operations guide`](API_README.md)
- [`Migration reconciliation`](MIGRATION_BASELINE_RECONCILIATION.md)
- [`Migration checker semantics`](MIGRATION_CHECKER_SEMANTICS.md)
- [`Migration index review`](MIGRATION_INDEX_REVIEW.md)
- [`Observability baseline`](OBSERVABILITY_BASELINE.md)
- [`Observability requirements audit`](OBSERVABILITY_REQUIREMENTS_AUDIT.md)
- [`Retention policy`](RETENTION_POLICY.md)
- [`Alerting baseline`](ALERTING_BASELINE.md)
- [`Windows observability verification`](OBSERVABILITY_WINDOWS_VERIFICATION.md)
- [`Worker metrics Windows verification`](WORKER_METRICS_WINDOWS_VERIFICATION.md)
- [`Storage security baseline`](STORAGE_SECURITY_BASELINE.md)
- [`Windows storage verification`](STORAGE_WINDOWS_VERIFICATION.md)
- [`Outbox success-path baseline`](OUTBOX_SUCCESS_PATH_BASELINE.md)
- [`Outbox advanced Windows verification`](OUTBOX_ADVANCED_WINDOWS_VERIFICATION.md)
- [`Windows e2e verification`](E2E_WINDOWS_VERIFICATION.md)
- [`Security controls baseline`](SECURITY_CONTROLS_BASELINE.md)
- [`CSRF applicability decision`](CSRF_DECISION.md)
- [`Generated API client decision`](GENERATED_CLIENT_DECISION.md)
- [`HTTP idempotency decision`](IDEMPOTENCY_DECISION.md)
- [`Architecture decisions`](ARCHITECTURE_DECISIONS.md)
- [`Hosted CI verification`](HOSTED_CI_VERIFICATION.md)
- [`Windows OpenTelemetry verification`](OTEL_WINDOWS_VERIFICATION.md)
- [`Observability closure decision`](OBSERVABILITY_CLOSURE_DECISION.md)
- [`Windows Docker-only closure boundary`](WINDOWS_DOCKER_CLOSURE_BOUNDARY.md)
- [`Final closure review`](FINAL_CLOSURE_REVIEW.md)
- [`Phase 2 entry decision`](../phase2/PHASE2_ENTRY_DECISION.md)
- [`Phase 2 plan audit`](../phase2/PHASE2_PLAN_AUDIT.md)
- [`Outbox delivery design`](OUTBOX_DELIVERY_DESIGN.md)
- [`CI pipeline expansion`](CI_PIPELINE_EXPANSION.md)
- [`Engineering governance re-verification`](ENGINEERING_GOVERNANCE_REVERIFICATION.md)
- [`Authoritative phase sequence`](../../Plan.txt)
- [`Engineering governance skill`](../../skills/engineering-governance/SKILL.md)

## References

1. [`Authoritative phase sequence`](../../Plan.txt)
2. [`Phase 1 detailed remediation plan`](PHASE1_REMEDIATION_PLAN_DETAILED.md)
3. [`Engineering governance skill`](../../skills/engineering-governance/SKILL.md)
4. [`GitHub repository`](https://github.com/elnewahy2025/Mohamy-pro)
5. [`NestJS documentation`](https://docs.nestjs.com)
6. [`Prisma Migrate documentation`](https://www.prisma.io/docs/orm/prisma-migrate)
7. [`BullMQ documentation`](https://docs.bullmq.io)
8. [`MinIO documentation`](https://min.io/docs/minio/linux/index.html)
9. [`Prometheus documentation`](https://prometheus.io/docs/introduction/overview/)
10. [`OpenTelemetry documentation`](https://opentelemetry.io/docs/)
11. [`GitHub Actions artifacts`](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts)
12. [`OWASP API Security`](https://owasp.org/API-Security/)
13. [`OWASP File Upload Cheat Sheet`](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
14. [`Docker Compose documentation`](https://docs.docker.com/compose/)
15. [`PostgreSQL documentation`](https://www.postgresql.org/docs/)
16. [`Redis documentation`](https://redis.io/docs/latest/)
17. [`Phase 1 API guide`](API_README.md)
18. [`Phase 1 runtime evidence`](DISPOSABLE_DATABASE_VALIDATION.md)
19. [`Fresh database verification`](FRESH_DATABASE_VERIFICATION.md)
20. [`Phase 1 frontend evidence`](FRONTEND_STACK_MIGRATION.md)
21. [`Phase 1 CI workflow`](../../.github/workflows/ci.yml)
22. [`Phase 1 backup script`](../../infrastructure/backup/backup.ps1)
23. [`Phase 1 restore script`](../../infrastructure/backup/restore-smoke.ps1)
24. [`Phase 1 API bootstrap`](../../backend/api/src/main.ts)
25. [`Phase 1 worker bootstrap`](../../backend/api/src/worker.ts)
26. [`Phase 1 outbox service`](../../backend/api/src/infrastructure/outbox/outbox.service.ts)
27. [`Phase 1 object-storage service`](../../backend/api/src/infrastructure/storage/object-storage.service.ts)
28. [`Phase 1 logger module`](../../backend/api/src/observability/logger.module.ts)
29. [`Phase 1 queue service`](../../backend/api/src/infrastructure/queue/queue.service.ts)
30. [`Phase 1 Prisma schema`](../../backend/api/prisma/schema.prisma)
31. [`Phase 1 package scripts`](../../backend/api/package.json)
32. [`Phase 1 project README`](README.md)
