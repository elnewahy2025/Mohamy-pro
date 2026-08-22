# Phase 2 Legacy Tenant-Boundary Implementation and Windows Evidence

**Status:** Verified for the `StorageObject`, `OutboxMessage`, and `IdempotencyKey` implementation slice, static checks, service-level behavior, and real Windows API/dispatcher/worker runtime evidence. **Phase 2 remains open.** This document does not authorize Phase 3 and does not make an unqualified production-readiness claim.

**Evidence date:** 2026-08-22

**Published implementation commit:** `0c9e204d` on `phase2/legacy-tenant-boundaries`

**Scope:** Continue the staged RLS workstream by making the three previously excluded legacy tables tenant-aware, enforcing fail-closed RLS, carrying scope into asynchronous delivery, and proving the behavior against Windows 11, Docker Desktop, PostgreSQL, Redis/BullMQ, and local MinIO.

> **Qualified decision.** The legacy tenant-boundary slice is evidenced on the approved Windows development/verification plane. The full Phase 2 completion gate remains open because authentication/session/OIDC, authorization, audit persistence, API envelopes and HTTP idempotency enforcement, abuse and identity-data lifecycle controls, frontend authentication and tenant switching, generated-client integration, and the complete integration/CI topology are not yet closed. The future supported Linux KMS/object-storage production plane also remains open.

## 1. Governing decisions and traceability

The approved Phase 2 RLS decision requires every tenant-owned table to use PostgreSQL RLS or an explicitly documented equivalent, with application runtime roles that do not receive `BYPASSRLS`.[1] It also requires tenant context to be established only after authentication and membership/policy validation, and requires asynchronous tenant jobs to carry validated tenant context rather than infer it from process-global state.[1]

The prior staged RLS evidence deliberately excluded `StorageObject`, `OutboxMessage`, and `IdempotencyKey` because their callers still used legacy behavior and a premature RLS policy would either break approved operational paths or encourage an unsafe `tenantId IS NULL` bypass.[2] This document records the follow-on implementation; it does not revise that decision retroactively.

| Requirement | Implementation evidence | Verification status |
|---|---|---|
| `StorageObject` tenant metadata boundary | `StorageObject` now has forced RLS with a valid server-derived tenant context predicate. `ObjectStorageService` requires tenant context, derives tenant-prefixed object keys, and persists protected metadata through the database boundary. | **PASS** in the fresh legacy runtime and clean local MinIO verifier |
| `OutboxMessage` scope boundary | `OutboxScope` distinguishes `GLOBAL` and `TENANT`; consistency constraints prevent incomplete tenant context; dispatcher, tenant, global, and update/delete policies are explicit. | **PASS** in fresh legacy runtime and real API/worker runtime |
| `IdempotencyKey` actor/tenant boundary | Scope, actor, method, route, fingerprint, state, response, lease, and maintenance fields are represented. Tenant actor operations and explicit global/maintenance paths have separate policies. | **PASS** in fresh legacy runtime and service-level verifier |
| Fail-closed RLS | All three tables use `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`; no permissive `tenantId IS NULL` policy is present. | **PASS** with a non-superuser, non-`BYPASSRLS` verifier role |
| Worker context propagation | Dispatcher claims rows using a named transaction-local dispatcher context; queue payloads carry scope and context metadata; worker validates persisted scope and executes handlers inside global or tenant transaction context. | **PASS** with real Redis/BullMQ and worker processes |
| Retry, lease, duplicate, and cleanup behavior | Advanced runtime verifier exercises retry backoff, expired lease reclamation, duplicate delivery, and generated-row cleanup. | **PASS** with real API dispatcher and worker |

## 2. Migration and schema implementation

Migration `20260822210000_legacy_tenant_boundaries` is additive with respect to row data. It creates or validates the `OutboxScope` and `IdempotencyState` enums, adds the required outbox and idempotency fields, adds consistency constraints and indexes, and preserves existing legacy rows. Existing outbox rows remain global; existing idempotency rows are retained as completed legacy records with a non-replayable legacy scope. The migration contains no table drop, truncate, or row-reset operation.[3]

The migration uses compatibility checks for pre-existing enum types and retry-safe `IF NOT EXISTS`/catalog guards. This matters because the Windows existing database exposed genuine partial-migration failures during development: first a duplicate `requestPath` column, then an existing enum type, then a PostgreSQL `name[]` versus `text[]` comparison. Those defects were corrected in the migration and recovered non-destructively through Prisma’s rolled-back migration resolution followed by `migrate deploy`. The final existing-database result was seven migrations found and no pending migrations. No database reset or destructive data operation was used.

The database-side context predicates are explicit and fail closed:

| Predicate | Purpose |
|---|---|
| `app_outbox_dispatch_context_is_valid()` | Allows dispatcher claim/update access only when `app.outbox_dispatcher=true` and `app.operation_id` is a valid UUID. |
| `app_global_operation_context_is_valid()` | Allows explicitly global operations only when `app.global_operation=true` and `app.operation_id` is a valid UUID. |
| `app_idempotency_maintenance_context_is_valid()` | Allows idempotency cleanup only when `app.idempotency_maintenance=true` and `app.operation_id` is a valid UUID. |
| Existing tenant predicate | Requires a valid transaction-local tenant, user, membership, and operation context for tenant-owned access. |

The migration creates twelve policies across the three tables: one for `StorageObject`, four for `OutboxMessage`, and seven for `IdempotencyKey`. `StorageObject` permits only valid tenant-context access. `OutboxMessage` separates tenant/global insert, read, update, and dispatcher-delete behavior. `IdempotencyKey` separates tenant-actor select/insert/update, explicit global select/insert/update, and maintenance delete behavior. Ordinary idempotency deletion is not a purge path.

## 3. Application caller and worker integration

`PrismaService` provides transaction-local helpers for ordinary tenant operations, global operations, dispatcher operations, idempotency maintenance, and pre-membership selection. The helpers use parameterized `set_config(..., true)` calls so PostgreSQL clears the context at transaction commit or rollback. The connection-pool verifier alternated tenant contexts and proved that a reused connection did not leak Tenant A rows into Tenant B.

`OutboxService` now validates the scope and required context before creating a message, claims pending or retryable messages through the named dispatcher context, creates context-bearing BullMQ payloads, and records retry or dead-letter state using lease tokens. `OutboxDispatcher` is registered in `AppModule` and runs on the API process through the scheduled 5-second interval. `OutboxWorker` is registered in `WorkerModule`, validates the persisted message against the job payload, applies the global or tenant transaction-local context, and treats already processed or dead-lettered rows as idempotent no-ops.

The real runtime topology is therefore deliberately two-process:

| Process | Responsibility | Required runtime evidence |
|---|---|---|
| API (`start:prod`) | PostgreSQL/Redis/MinIO initialization, HTTP process, and scheduled `OutboxDispatcher` polling/claiming | API reports successful startup and dispatcher submits messages to the worker queue |
| Worker (`start:worker`) | BullMQ consumption and scoped outbox handler execution | Worker reports readiness on `mohamy-application` and starts processing claimed jobs |
| Verifier | Inserts only generated test rows, observes durable database transitions, and removes only its generated IDs/jobs | All advanced markers pass and cleanup is zero |

## 4. Static and repository verification

The following checks were run after commit `0c9e204d` on Windows, with the API and worker stopped during the static gate block unless otherwise noted.

| Check | Command/result | Status |
|---|---|---|
| Package manager | `pnpm --version` returned `11.22.0` | **PASS** |
| Dependency synchronization | `pnpm install --frozen-lockfile` completed with all six workspace projects up to date | **PASS** |
| Prisma Client | `pnpm --filter api exec prisma generate` completed successfully | **PASS** |
| Existing database migration state | `pnpm --filter api exec prisma migrate deploy` reported `No pending migrations to apply.` | **PASS** |
| Prisma schema validation | `pnpm --filter api exec prisma validate` reported the schema is valid | **PASS** |
| API build | `pnpm --filter api run build` completed successfully | **PASS** |
| API lint | `pnpm --filter api exec eslint 'src/**/*.ts' 'test/**/*.ts'` completed successfully | **PASS** |
| Full API unit suite | `pnpm --filter api exec jest --runInBand`: 13 suites and 51 tests passed | **PASS** |
| Migration classifier | `pnpm --filter api exec node scripts/migration-checker-core.test.mjs`: 5 tests passed, 0 failed | **PASS** |
| Advanced verifier syntax | `node --check backend/api/scripts/outbox-advanced-runtime-check.mjs` completed successfully | **PASS** |
| Diff hygiene | `git diff --check` completed successfully | **PASS** |
| Prisma format diagnostic | The Windows `prisma format --check` invocation reported unformatted files, but formatting an isolated temporary schema copy produced no line-level difference. The repository schema was not overwritten. | **QUALIFIED; not a clean native Windows CLI pass** |

The format result is recorded rather than suppressed: the temporary-copy evidence shows no substantive schema formatting delta, while the native Windows `--check` result remains an environment/CLI discrepancy that should be rechecked in a later controlled toolchain gate. It does not change the migration or runtime results and no local protected file was modified.

The expected rate-limiter-unavailable log appeared during the existing fail-closed rate-limiter test; the test suite passed. It was not a production runtime failure.

## 5. Real Windows runtime evidence

### 5.1 Existing database migration

The Windows existing `mohamy_pro` database completed the migration recovery and then reported:

```text
7 migrations found in prisma/migrations
No pending migrations to apply.
```

The final migration state was also checked by Prisma and reported `Database schema is up to date!`. Existing data was preserved. The database was not reset, recreated, or manually edited through migration-table changes.

### 5.2 Fresh PostgreSQL legacy RLS verifier

The disposable verifier created a generated database and applied all seven migrations. The real Windows output was:

```text
legacy_runtime_role_status=PASS|superuser=false|bypassrls=false
legacy_metadata_status=PASS|tables=3|policies=12
legacy_default_deny_status=PASS|storage_read=0|outbox_read=0|idempotency_read=0|insert_denied=true|ordinary_idempotency_delete_denied=true|ordinary_delete_rows=0|record_preserved=true
legacy_tenant_isolation_status=PASS|tenant_a_own=1|tenant_a_sees_b=0|tenant_b_sees_a=0
legacy_cross_tenant_write_status=PASS|storage=DENIED|outbox=DENIED|idempotency=DENIED
legacy_scope_status=PASS|global_outbox=1|global_idempotency=1|global_storage=0|dispatcher_outbox=3
legacy_rollback_status=PASS|rolled_back_storage_rows=0|post_rollback_no_context_rows=0
legacy_pool_reuse_status=PASS|tenant_a_to_b_context_reset=true|tenant_b_sees_a=0
legacy_runtime_result=PASS|database=mohamy_phase2_legacy_fresh_1787394830293_86a639ce
```

This proves the database-side boundary for the three-table slice under a runtime role that is neither a superuser nor a `BYPASSRLS` role. It does not prove the unimplemented HTTP authentication or authorization layers.

### 5.3 Real Redis/BullMQ service-level verifier

The fresh service verifier connected to the actual local Redis container and exercised the scoped idempotency and tenant outbox services:

```text
legacy_service_idempotency_status=PASS|first=RESERVED|in_progress=IN_PROGRESS|replay=REPLAY|conflict=CONFLICT
legacy_service_outbox_status=PASS|created=1|queued=1|processed=1|scope=TENANT
legacy_service_cleanup_status=PASS|business_rows_removed=true
legacy_service_runtime_result=PASS|database=mohamy_phase2_services_fresh_1787395759217_510b9f0f
```

This is service-level evidence, not proof that the HTTP interceptor/controller idempotency contract is complete. The authoritative API envelope and HTTP idempotency decision still requires endpoint-level enforcement and contract tests.[4]

### 5.4 Local MinIO clean storage verifier

The clean local MinIO run connected to the configured development endpoint and produced:

```text
clean_upload_status=PASS
versioning_status=PASS|versions=8bb3c23c-b8c6-4040-b049-aad9453f9ec5,d3b421d7-ff83-441c-9148-c3525b7defcb
sha256_status=PASS|sha256=18f22627b0072db783fb25d76fad73e41b10ed99acf033a4ed4af2f816d8ac7b|size=70
malware_status=PASS|configured=disabled|recorded=NOT_SCANNED
encryption_status=PASS|configured=NONE|server_side_encryption=none
tenant_download_scope_status=PASS|server_derived_prefix=true
object_lock_status=SKIP|configured=false|development_boundary=true
storage_security_result=PASS|mode=clean
```

The `SKIP` and disabled settings are intentional development boundaries, not production-security evidence. KMS-backed encryption, Object Lock, and enabled malware scanning/ClamAV remain future deployment gates.

### 5.5 Real API-dispatcher and worker advanced outbox verifier

The first advanced verifier attempt was run with only the worker process. It correctly left the generated row at `PENDING` with `attempts=0`, because `OutboxDispatcher` belongs to `AppModule` and the API process owns scheduled polling. The verifier cleaned its generated rows and reported failure without leaving residue. The topology was corrected to run the API and worker together.

With both processes running, the API reported dispatcher submissions, the worker reported real PostgreSQL and Redis connections and queue readiness, and the corrected verifier passed:

```text
retry_backoff_status=PASS|first_available_at_future=true|delay_ms=1030|second_attempts=2
lease_expiry_status=PASS|reclaimed_attempts=2|final_status=FAILED
duplicate_delivery_status=PASS|job_states=completed,completed|processed_attempts=1
outbox_cleanup_remaining=0
outbox_advanced_result=PASS
```

The worker log contained expected error-level entries for the verifier’s generated synthetic event types. Those event types are intentionally unregistered so the failure path is exercised. `OutboxWorker` catches the handler failure, records retry/dead-letter state through `recordFailure`, and completes the BullMQ job without an unhandled process crash. The duplicate jobs completed because the persisted row was already `PROCESSED`, and the worker’s idempotent path left `processed_attempts=1`.

The verifier initially required the transient `PROCESSING` state to be observed after expired-lease reclamation. Under the real 5-second dispatcher interval and fast handler failure, the row could move from `PROCESSING` to `FAILED` and be reclaimed again before a 500ms polling observation. Commit `0c9e204d` changed the assertion to require durable evidence of a new attempt and replacement of the injected expired lease, accepting the valid durable states `PROCESSING`, `FAILED`, or `DEAD_LETTER`, followed by the final retry/dead-letter assertion. This is an observation-race correction, not a relaxation of the database or worker security boundary.

## 6. Repository preservation and branch boundary

The Windows checkout remained on `phase2/legacy-tenant-boundaries`. The known local work was preserved throughout synchronization and runtime verification:

```text
 M infrastructure/docker/docker-compose.yml
?? ENGINEERING_BACKLOG.zip
?? "Prompt for External AI … Mohamy Pro Phase 1 Migration Reconciliation.md"
?? docs/phase1/FRESH_DATABASE_MERGE_RECOVERY.md
```

The implementation was published only to `origin/phase2/legacy-tenant-boundaries` at commit `0c9e204d`. `origin/main` was not overwritten or merged. No unrelated Docker container, volume, license, credential, password, `DATABASE_URL`, Health-ERP resource, or Vision-ERP resource was touched.

## 7. Remaining Phase 2 work and explicit non-closure

The following items remain open and prevent a Phase 2 completion claim:

| Open boundary | Why it remains open |
|---|---|
| Authentication, session, and OIDC | Provider integration, issuer/audience/signature validation, browser session transport, revocation, refresh-token handling, MFA, and real integration tests are not complete. |
| Authorization | Named RBAC/ABAC/resource policies, explicit denials, branch/department restrictions, and Platform Admin controls are not fully implemented and tested. |
| Audit event store | Append-only authentication, membership, authorization, tenant-switch, and privileged-access audit persistence, redaction, retention, and authorization remain open. |
| API envelopes and HTTP idempotency | Service-level reservation/replay/conflict behavior passes, but the required API interceptor/controller enforcement and endpoint contract tests are not complete. |
| Abuse and identity-data lifecycle | Authentication abuse controls, enumeration resistance, identity retention/minimization/export/deletion rules, and lifecycle implementation remain open. |
| Frontend authentication and tenant switching | Next.js authenticated flows, membership selection, tenant switching, bilingual RTL/LTR UX, accessibility, and server-authoritative authorization presentation remain open. |
| Generated client and integration/CI topology | Generated API-client re-entry, real OIDC integration, full security pipeline, and approved CI topology remain open. |
| Production object-storage plane | The verified MinIO setup is development-only: encryption is `NONE`, malware scanning is disabled, and Object Lock is disabled. Supported Linux KMS/object-storage evidence remains required. |

Accordingly, this document closes only the legacy-table implementation and its qualified Windows evidence. It does not close the full Phase 2 completion gate, does not authorize Phase 3 Security Foundation and Audit Foundation, and does not establish production readiness.

The Phase 2 plan remains the authoritative completion gate: the phase is complete only when the identity and tenancy dependency chain is implemented, secured, tested, runtime-verified, documented, and reviewed against the plan.[5] The implementation and evidence in this document satisfy only the scoped legacy-boundary continuation and its associated runtime gates. The worker behavior described above follows the scoped outbox decision and service implementation.[1] [6] [7]

The storage and idempotency implementation references are included for direct traceability to the caller paths that were brought behind the new boundary.[8] [9] Engineering-governance verification, traceability, security, runtime-testing, and production-readiness requirements remain mandatory for subsequent Phase 2 work.[10]

## References

[1]: RLS_TENANT_ENFORCEMENT_DECISION.md "Phase 2 RLS and Tenant-Enforcement Decision"
[2]: RLS_TENANT_CONTEXT_IMPLEMENTATION.md "Phase 2 RLS and Tenant-Context Implementation"
[3]: ../../backend/api/prisma/migrations/20260822210000_legacy_tenant_boundaries/migration.sql "Legacy tenant-boundary migration"
[4]: API_ENVELOPE_IDEMPOTENCY_DECISION.md "API Envelope and Idempotency Decision"
[5]: PHASE2_IMPLEMENTATION_PLAN.md "Phase 2 Implementation Plan — Identity and Multi-Tenancy"
[6]: ../../backend/api/src/infrastructure/outbox/outbox.service.ts "Outbox service implementation"
[7]: ../../backend/api/src/infrastructure/outbox/outbox.worker.ts "Outbox worker implementation"
[8]: ../../backend/api/src/infrastructure/storage/object-storage.service.ts "Object storage service implementation"
[9]: ../../backend/api/src/infrastructure/idempotency/idempotency.service.ts "Idempotency service implementation"
[10]: ../../skills/engineering-governance/SKILL.md "Engineering governance skill"
