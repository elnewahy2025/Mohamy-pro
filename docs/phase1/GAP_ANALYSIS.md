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
| Outbox success path | `UNVERIFIED` | No current HTTP write endpoint or registered business-domain handler exists, so `PENDING → PROCESSING → PROCESSED` has not been demonstrated through a business event. |
| Outbox advanced recovery | `PARTIAL` | Unit tests cover state transitions; real retry-backoff, lease expiry, duplicate delivery, graceful shutdown, and success-handler workflows remain unexecuted. |
| API production startup | `PASS` | `dist/src/main.js` starts and connects to PostgreSQL, Redis, queue, and MinIO. The previous wildcard route warnings were removed. |
| Health and readiness | `PASS` | Windows production runtime returned HTTP 200 for liveness and readiness; all four dependencies reported `up`. |
| OpenAPI | `PASS` | `/api/docs-json` returned HTTP 200 with the current versioned routes. |
| Backup and restore smoke | `PASS` | Backup was created, restored into a temporary database, validated, and cleaned up without replacing the primary database. |
| Frontend foundation | `PASS WITH SCOPE LIMIT` | Next.js App Router, English/Arabic locale support, RTL/LTR direction, responsive layout, and accessibility foundations are present. Business workflows are outside this foundation scope. |
| Generated API client | `UNVERIFIED` | Shared contracts exist, but generated OpenAPI client artifacts and consumer tests are not evidenced. |
| HTTP idempotency integration | `PARTIAL` | The persistence registry exists; complete request interception, replay, conflict, expiry, scope, and concurrency behavior are not evidenced. |
| Basic object storage | `PASS WITH SCOPE LIMIT` | Bucket readiness, basic object operations, signed download URLs, and private access are implemented and readiness-tested. |
| Storage security controls | `MISSING` | Integrity metadata enforcement, versioning, retention/legal hold, encryption-specific configuration, malware scanning, and download/share audit are not implemented and evidenced. |
| Structured logging and correlation IDs | `PASS` | Production logs, correlation IDs, sensitive-header redaction, and runtime startup are evidenced. |
| Metrics and tracing | `PARTIALLY VERIFIED` | Prometheus metric families, protected `/api/metrics`, OpenTelemetry API/worker bootstrap, HTTP/PostgreSQL/ioredis auto-instrumentation, explicit outbox spans, and W3C queue propagation are implemented. Build and unit tests pass; Windows runtime scrape and collector-received spans remain unverified. |
| Retention and alerting | `PARTIALLY VERIFIED` | Loki 30-day, Prometheus 90-day, OpenTelemetry Collector, and critical Prometheus alert configurations are present. Hosted retention enforcement and alert routing are not runtime-verified; audit/security event persistence remains explicitly owned by later roadmap phases. |
| Input validation and security headers | `PASS` | Global validation, whitelist/forbid behavior, Helmet, CORS configuration, and redaction are implemented. |
| Rate limiting and CSRF | `UNVERIFIED` | These controls are not evidenced for the current API surface. |
| Authentication and authorization | `DEFERRED BY ROADMAP` | Identity, membership, tenant isolation, RBAC/ABAC, and resource authorization belong to later phases and are not claimed here. |
| Hosted CI/security artifacts | `UNVERIFIED` | The workflow definition contains quality, migration, e2e, security, container, SBOM, and DAST jobs, but a successful hosted run and artifact review are still required. |
| Local e2e | `UNVERIFIED` | A complete Windows e2e run against the real services has not been captured. |
| Architecture fitness | `PARTIAL` | Basic boundary checks exist, but API/worker orchestration, PostgreSQL version policy, and reserved workspace-scope decisions need explicit evidence. |
| Documentation | `PARTIAL` | API, observability, retention, alerting, acceptance, and migration documents are updated in the working tree; final cross-document link review and publication remain required. |

## Remaining blockers for unconditional Phase 1 closure

1. Hosted GitHub Actions execution and retained quality/security artifacts are not verified.
2. Metrics and distributed tracing are implemented at application level, but current Windows scrape/collector evidence and hosted retention/alert-routing evidence remain unverified.
3. Advanced object-storage security controls are absent.
4. The outbox success path and advanced recovery paths are not fully demonstrated.
5. Generated API client artifacts and consumer tests are not evidenced.
6. Rate limiting and CSRF decisions/tests remain open.
7. The legacy database state is accepted and documented, but the machine-local migration remains non-reproducible and must not be silently rewritten.
8. The final Phase 1 acceptance report and cross-document links must be updated after all evidence is collected.

## Phase boundary

Phase 2 remains paused. The current evidence proves a functioning foundation runtime, not a complete legal-operations platform. Phase 1 may close only when every remaining item is implemented and evidenced or has an explicit documented deferral with owner, target phase, rationale, risk, and acceptance impact.

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
