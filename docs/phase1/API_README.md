# Mohamy Pro API and Worker Operations Guide

## Purpose and boundary

This guide documents the **Phase 1 foundation runtime** for the NestJS API and its separate outbox worker. The API uses Prisma 7 with PostgreSQL, Redis, BullMQ, an S3-compatible object-storage adapter, structured Pino logging, correlation IDs, URI versioning, OpenAPI, validation, security headers, health checks, Prometheus metrics, OpenTelemetry instrumentation, and transactional outbox delivery.

Identity, authentication, memberships, tenant isolation, authorization, legal-case workflows, business audit events, billing, AI, and document-sharing workflows are not implemented in this foundation. The idempotency registry is a persistence component; the complete HTTP lifecycle is deferred until the first state-changing business endpoint. The generated API-client decision is documented separately. These boundaries are intentional and must not be represented as implemented capabilities.

The final deployment decision is governed by [`WINDOWS_DOCKER_CLOSURE_BOUNDARY.md`](WINDOWS_DOCKER_CLOSURE_BOUNDARY.md):

> **Phase 1 implementation and Windows runtime gates closed; deployment production boundary open.**

This wording closes the application and Windows-provable controls without making an unsupported production-availability claim for a workstation-only object-storage/key-management plane.

## Local infrastructure

The Mohamy services use isolated host ports so the existing Health-ERP and Vision-ERP containers remain untouched.

| Service | Host port | Container port | Purpose |
|---|---:|---:|---|
| PostgreSQL 16 | `55432` | `5432` | Prisma database and migration history |
| Redis 7 | `56379` | `6379` | BullMQ queue, worker coordination, and rate limiting |
| Primary MinIO API | `59000` | `9000` | Local S3-compatible development storage |
| Primary MinIO console | `59001` | `9001` | Local storage administration |
| API | `3000` | `3000` | HTTP API when started locally |
| Worker metrics | `3002` | `3002` | Dedicated Prometheus worker registry |

The isolated storage-security verification stack uses separate container names, ports, network, and runtime data. Never stop or remove `mohamy-minkms`, `mohamy-aistor-security`, or `mohamy-clamav-security` without explicit approval. Never touch Health-ERP or Vision-ERP.

## Required terminal state

Before any command that rebuilds or restarts the application, stop only the Mohamy API and worker processes with **Ctrl+C**. Keep PostgreSQL, Redis, primary MinIO, the isolated storage-security containers, Health-ERP, and Vision-ERP running. After preparation, start the API and worker in separate PowerShell terminals. The API and worker are separate processes; readiness of one does not imply readiness of the other.

## Environment contract

Environment values must be supplied by the deployment environment and must not be committed to Git or copied into evidence documents. Local development values are not production credentials.

| Variable | Required behavior |
|---|---|
| `NODE_ENV` | Explicitly set to `production` in production; the validator accepts `development`, `test`, and `production`. |
| `PORT` | Integer from `1` through `65535`; local API default is `3000`. |
| `DATABASE_URL` | Required in every environment. The local database uses host port `55432`; credentials must not appear in documentation. |
| `REDIS_URL` | Required in production and by the worker; local Redis uses host port `56379`. |
| `S3_ENDPOINT` | Required in production and by the storage adapter. |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Required in production and supplied only through local/deployment configuration. |
| `S3_BUCKET` | Required in production. |
| `S3_VERSIONING_ENABLED` | Must be `true` in production. |
| `S3_OBJECT_LOCK_ENABLED` | Must be `true` in production when retention/legal hold is required. Existing buckets are checked and are not silently upgraded. |
| `S3_ENCRYPTION_MODE` | `AES256` or `aws:kms` in production; `NONE` is development-only. |
| `S3_KMS_KEY_ID` | Required when `S3_ENCRYPTION_MODE=aws:kms`. |
| `MALWARE_SCAN_ENABLED` | Must be `true` in production; uploads fail closed when ClamAV is unavailable. |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Required when malware scanning is enabled. |
| `CORS_ORIGINS` | Required in production and parsed as a comma-separated list. |
| `METRICS_ENABLED` | Enables the protected API and worker metrics endpoints. |
| `METRICS_AUTH_TOKEN` | Required for production Prometheus authorization. Local loopback-only access is allowed for verification. |
| `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT` | Enable tracing only with a reachable collector endpoint. |
| `OTEL_SERVICE_NAME` | API service identity; the worker uses `mohamy-worker`. |

## Synchronization and database preparation

Run commands from the actual repository root with pnpm `11.22.0`:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
git status --short
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate deploy
pnpm --filter api run build
```

Before pulling, review `git status --short`. Preserve all local changes and untracked files; never reset, restore, stash, delete, or overwrite them without explicit approval. After synchronization, the required install, Prisma generation, migration deployment, and build commands must be executed.

The repository has four canonical migrations:

1. `00000000000000_init`
2. `20260820190000_outbox_delivery_semantics`
3. `20260821000000_repair_baseline_indexes`
4. `20260821160000_storage_security_metadata`

The clean disposable migration chain is reproducible. The existing Windows database contains an accepted legacy migration absent from Git; the migration checker must continue to report that difference. Do not edit `_prisma_migrations`, reset the database, delete volumes, or manually resolve the legacy state. See [`MIGRATION_BASELINE_RECONCILIATION.md`](MIGRATION_BASELINE_RECONCILIATION.md), [`MIGRATION_CHECKER_SEMANTICS.md`](MIGRATION_CHECKER_SEMANTICS.md), and [`DISPOSABLE_DATABASE_VALIDATION.md`](DISPOSABLE_DATABASE_VALIDATION.md).

## Production startup

**API is stopped. Worker is stopped.** Start the API in Terminal 1:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
pnpm --filter api start:prod
```

Wait for the API to log successful startup and connections to PostgreSQL, Redis, queue, and object storage.

**API is running. Worker is stopped.** Start the worker in Terminal 2:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
pnpm --filter api start:worker
```

Wait for `Outbox worker is ready on mohamy-application` and `Outbox worker process started`. The Windows runtime evidence also verified that stopping the worker first and the API second with Ctrl+C returned both terminals to PowerShell without an error.

## HTTP endpoints

The global prefix is `/api`, and URI versioning uses version `1`.

| Endpoint | Expected result | Purpose |
|---|---:|---|
| `GET /api/v1` | `200` | Service information |
| `GET /api/v1/health/live` | `200` | Process liveness |
| `GET /api/v1/health/ready` | `200` when dependencies are up | PostgreSQL, Redis, queue, and object-storage readiness |
| `GET /api/v1/health` | `200` when dependencies are up | Aggregate readiness |
| `GET /api/docs-json` | `200` | OpenAPI JSON |
| `GET /api/docs` | Documentation page | Interactive OpenAPI |
| `GET /api/metrics` | `200` when enabled and authorized | API Prometheus registry |
| `GET http://localhost:3002/metrics` | `200` when enabled and authorized | Worker Prometheus registry |

Windows runtime evidence returned HTTP 200 for liveness, readiness, OpenAPI, the API metrics endpoint, and the worker metrics endpoint. Readiness reported PostgreSQL, Redis, queue, and object storage as `up`. Responses include `x-correlation-id`; logger redaction covers authorization, cookie, API-key, and set-cookie fields.

## Testing and runtime evidence

Run the API unit/build gates from the repository root:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
pnpm --filter api run build
pnpm --filter api exec jest --runInBand
pnpm --filter api exec eslint 'src/**/*.ts' 'test/**/*.ts'
```

The latest recorded Windows unit result is **11 suites and 32 tests passed**. Hosted CI run `32507250236` passed the recorded quality, static-security, container, and DAST jobs with retained coverage, SBOM, SARIF, and ZAP artifacts. Windows e2e evidence records one suite and four tests against real PostgreSQL, Redis, and MinIO. See [`E2E_WINDOWS_VERIFICATION.md`](E2E_WINDOWS_VERIFICATION.md) and [`HOSTED_CI_VERIFICATION.md`](HOSTED_CI_VERIFICATION.md).

The outbox advanced runner returned `node_exit=0` with passing retry-backoff, lease-expiry reclamation, duplicate-delivery, cleanup, and final-result lines. The intentional `handler failed` messages in that run are failure-path test stimuli; the worker caught them, persisted retry/dead-letter state, completed the BullMQ jobs, and remained alive. See [`OUTBOX_ADVANCED_WINDOWS_VERIFICATION.md`](OUTBOX_ADVANCED_WINDOWS_VERIFICATION.md) and [`OUTBOX_SUCCESS_PATH_BASELINE.md`](OUTBOX_SUCCESS_PATH_BASELINE.md).

## Backup and restore smoke

**API is stopped. Worker is stopped. Docker infrastructure remains running.** Create and restore a backup into a uniquely named temporary database:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
& .\infrastructure\backup\backup.ps1
$backup = Get-ChildItem '.\infrastructure\backup\artifacts\mohamy_pro-*.sql' | Sort-Object LastWriteTime | Select-Object -Last 1
if ($null -eq $backup) { throw 'No backup artifact was created.' }
& .\infrastructure\backup\restore-smoke.ps1 -BackupFile $backup.FullName
```

The Windows evidence created a backup, restored it into a temporary database, validated tables and indexes, and cleaned the temporary database without replacing the primary database. Encrypted/off-machine retention, RPO/RTO, and disaster recovery remain outside this local smoke test; see [`BACKUP_BASELINE.md`](BACKUP_BASELINE.md).

## Storage-security boundary

The isolated Windows runtime evidence proved distinct object versions, SHA-256 and size metadata, observed `aws:kms` server-side encryption, Object Lock/legal-hold deletion rejection, clean ClamAV scanning, and fail-closed behavior when ClamAV was unavailable. The primary local Compose MinIO remains a development service and is not evidence of production KMS availability. See [`STORAGE_WINDOWS_VERIFICATION.md`](STORAGE_WINDOWS_VERIFICATION.md), [`STORAGE_RUNTIME_EVIDENCE_PLAN.md`](STORAGE_RUNTIME_EVIDENCE_PLAN.md), and [`WINDOWS_DOCKER_CLOSURE_BOUNDARY.md`](WINDOWS_DOCKER_CLOSURE_BOUNDARY.md).

## Observability boundary

Windows evidence proves protected API and worker metric registries, bounded labels, and temporary OpenTelemetry collector receipt from both `mohamy-api` and `mohamy-worker`. The collector run used a direct SQL producer, not a state-changing API endpoint, so API-originated parent/child trace continuity is not claimed. Durable trace-backend delivery, effective Loki/Prometheus retention, Alertmanager routing, and collector-outage behavior are deployment re-entry gates. See [`OBSERVABILITY_CLOSURE_DECISION.md`](OBSERVABILITY_CLOSURE_DECISION.md), [`OTEL_WINDOWS_VERIFICATION.md`](OTEL_WINDOWS_VERIFICATION.md), [`RETENTION_POLICY.md`](RETENTION_POLICY.md), and [`ALERTING_BASELINE.md`](ALERTING_BASELINE.md).

## Canonical Phase 1 references

- [`Acceptance report`](ACCEPTANCE_REPORT.md)
- [`Gap analysis`](GAP_ANALYSIS.md)
- [`Architecture decisions`](ARCHITECTURE_DECISIONS.md)
- [`Security controls baseline`](SECURITY_CONTROLS_BASELINE.md)
- [`CSRF decision`](CSRF_DECISION.md)
- [`Idempotency decision`](IDEMPOTENCY_DECISION.md)
- [`Generated API-client decision`](GENERATED_CLIENT_DECISION.md)
- [`Migration reconciliation`](MIGRATION_BASELINE_RECONCILIATION.md)
- [`Migration checker semantics`](MIGRATION_CHECKER_SEMANTICS.md)
- [`Outbox delivery design`](OUTBOX_DELIVERY_DESIGN.md)
- [`Outbox success-path evidence`](OUTBOX_SUCCESS_PATH_BASELINE.md)
- [`Outbox advanced-recovery evidence`](OUTBOX_ADVANCED_WINDOWS_VERIFICATION.md)
- [`Storage security baseline`](STORAGE_SECURITY_BASELINE.md)
- [`Windows storage evidence`](STORAGE_WINDOWS_VERIFICATION.md)
- [`Observability closure decision`](OBSERVABILITY_CLOSURE_DECISION.md)
- [`Observability requirements audit`](OBSERVABILITY_REQUIREMENTS_AUDIT.md)
- [`Windows observability evidence`](OBSERVABILITY_WINDOWS_VERIFICATION.md)
- [`OpenTelemetry runtime plan`](OTEL_RUNTIME_EVIDENCE_PLAN.md)
- [`Windows OpenTelemetry evidence`](OTEL_WINDOWS_VERIFICATION.md)
- [`Retention policy`](RETENTION_POLICY.md)
- [`Alerting baseline`](ALERTING_BASELINE.md)
- [`Windows Docker closure boundary`](WINDOWS_DOCKER_CLOSURE_BOUNDARY.md)
- [`Engineering-governance re-verification`](ENGINEERING_GOVERNANCE_REVERIFICATION.md)
- [`Phase 1 remediation plan`](PHASE1_REMEDIATION_PLAN_DETAILED.md)

## Phase 0 references

- [`Phase 0 stack`](../phase0/STACK.md)
- [`Phase 0 observability policy`](../phase0/OBSERVABILITY.md)
- [`Phase 0 testing policy`](../phase0/TESTING.md)
- [`Phase 0 security policy`](../phase0/SECURITY.md)
- [`Phase 0 deployment policy`](../phase0/DEPLOYMENT.md)
- [`Phase 0 database policy`](../phase0/DATABASE.md)
- [`Phase 0 threat model`](../phase0/THREAT_MODEL.md)
- [`Phase 0 provider capability matrix`](../phase0/PROVIDER_CAPABILITY_MATRIX.md)
- [`Phase 0 integration contracts`](../phase0/INTEGRATION_CONTRACTS.md)

## External references

1. [NestJS documentation](https://docs.nestjs.com)
2. [Prisma Migrate documentation](https://www.prisma.io/docs/orm/prisma-migrate)
3. [BullMQ job IDs and retries](https://docs.bullmq.io/guide/jobs/job-ids)
4. [BullMQ graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown)
5. [OpenTelemetry documentation](https://opentelemetry.io/docs/)
6. [Prometheus documentation](https://prometheus.io/docs/introduction/overview/)
7. [MinIO object locking](https://min.io/docs/minio/linux/administration/object-management/object-retention.html)
8. [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
9. [Docker Compose documentation](https://docs.docker.com/compose/)
10. [PostgreSQL backup documentation](https://www.postgresql.org/docs/current/backup.html)
