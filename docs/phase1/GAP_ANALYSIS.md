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
| Outbox advanced recovery | `PARTIAL` | Unit tests cover state transitions; real retry-backoff, lease expiry, duplicate delivery, graceful shutdown, and success-handler workflows remain unexecuted. |
| API production startup | `PASS` | `dist/src/main.js` starts and connects to PostgreSQL, Redis, queue, and MinIO. The previous wildcard route warnings were removed. |
| Health and readiness | `PASS` | Windows production runtime returned HTTP 200 for liveness and readiness; all four dependencies reported `up`. |
| OpenAPI | `PASS` | `/api/docs-json` returned HTTP 200 with the current versioned routes. |
| Backup and restore smoke | `PASS` | Backup was created, restored into a temporary database, validated, and cleaned up without replacing the primary database. |
| Frontend foundation | `PASS WITH SCOPE LIMIT` | Next.js App Router, English/Arabic locale support, RTL/LTR direction, responsive layout, and accessibility foundations are present. Business workflows are outside this foundation scope. |
| Generated API client | `DOCUMENTED DEFERRAL` | [`GENERATED_CLIENT_DECISION.md`](GENERATED_CLIENT_DECISION.md) records why a client is not useful on the foundation-only API and defines the Phase 2 consumer gate. |
| HTTP idempotency integration | `PARTIAL` | The persistence registry exists; complete request interception, replay, conflict, expiry, scope, and concurrency behavior are not evidenced. |
| Basic object storage | `PASS WITH SCOPE LIMIT` | Bucket readiness, basic object operations, signed download URLs, and private access are implemented and readiness-tested. |
| Storage security controls | `PARTIALLY VERIFIED` | Storage metadata, SHA-256 hashing, configured versioning/encryption, retention/legal-hold checks, and ClamAV fail-closed boundary are implemented and covered by repository build/unit tests. The new migration, MinIO versioning behavior, object-lock behavior, and real ClamAV scan remain Windows/deployment evidence gates. |
| Structured logging and correlation IDs | `PASS` | Production logs, correlation IDs, sensitive-header redaction, and runtime startup are evidenced. |
| Metrics and tracing | `PARTIALLY VERIFIED` | API and dedicated worker Prometheus registries, protected API/worker endpoints, OpenTelemetry API/worker bootstrap, HTTP/PostgreSQL/ioredis auto-instrumentation, explicit outbox spans, and W3C queue propagation are implemented. Build and unit tests pass; the new worker endpoint and collector-received spans still require Windows/deployment evidence. |
| Retention and alerting | `PARTIALLY VERIFIED` | Loki 30-day, Prometheus 90-day, OpenTelemetry Collector, and critical Prometheus alert configurations are present. Hosted retention enforcement and alert routing are not runtime-verified; audit/security event persistence remains explicitly owned by later roadmap phases. |
| Input validation and security headers | `PASS` | Global validation, whitelist/forbid behavior, Helmet, CORS configuration, and redaction are implemented. |
| Rate limiting and CSRF | `RATE LIMIT PASS; CSRF N/A` | Redis-backed atomic rate limiting is unit-tested and Windows-verified with raw 200/200/429 headers and `Retry-After`. [`CSRF_DECISION.md`](CSRF_DECISION.md) records that the current read-only, non-cookie API has no applicable CSRF surface and defines the future re-entry gate. |
| Authentication and authorization | `DEFERRED BY ROADMAP` | Identity, membership, tenant isolation, RBAC/ABAC, and resource authorization belong to later phases and are not claimed here. |
| Hosted CI/security artifacts | `PASS` | [`HOSTED_CI_VERIFICATION.md`](HOSTED_CI_VERIFICATION.md) records successful quality, static security, container, and DAST jobs with retained coverage, SBOM, SARIF, and ZAP artifacts. |
| Local e2e | `PASS` | [`E2E_WINDOWS_VERIFICATION.md`](E2E_WINDOWS_VERIFICATION.md) records the Windows run against real PostgreSQL, Redis, and MinIO: 1 suite and 4 tests passed. |
| Architecture fitness | `ACCEPTED` | [`ARCHITECTURE_DECISIONS.md`](ARCHITECTURE_DECISIONS.md) records PostgreSQL 16, separate API/worker processes, and reserved `integrations/*` and `ai/*` scopes. |
| Documentation | `PARTIAL` | Phase 1 evidence, security, architecture, acceptance, and migration documents are updated; final cross-document link review and publication remain required. |

## Remaining blockers for unconditional Phase 1 closure

1. Metrics and distributed tracing are implemented at application level, but collector-received spans and hosted retention/alert-routing evidence remain unverified.
2. Storage-security controls are implemented at application level, but real S3/MinIO versioning, object-lock, encryption, and ClamAV runtime evidence remain open.
3. The registered outbox success handler and advanced recovery paths are not fully demonstrated through a real Windows dispatcher-to-worker workflow.
4. HTTP idempotency interceptor/request lifecycle behavior remains unverified.
5. The legacy database state is accepted and documented, but the machine-local migration remains non-reproducible and must not be silently rewritten.
6. Final documentation cross-links and the consolidated Phase 1 closure review remain open.

## Phase boundary

Phase 2 remains paused. The current evidence proves a functioning foundation runtime and application-level storage-security controls, not a complete legal-operations platform. Phase 1 may close only when every remaining item is implemented and evidenced or has an explicit documented deferral with owner, target phase, rationale, risk, and acceptance impact.

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
- [`Windows e2e verification`](E2E_WINDOWS_VERIFICATION.md)
- [`Security controls baseline`](SECURITY_CONTROLS_BASELINE.md)
- [`CSRF applicability decision`](CSRF_DECISION.md)
- [`Generated API client decision`](GENERATED_CLIENT_DECISION.md)
- [`Architecture decisions`](ARCHITECTURE_DECISIONS.md)
- [`Hosted CI verification`](HOSTED_CI_VERIFICATION.md)
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
