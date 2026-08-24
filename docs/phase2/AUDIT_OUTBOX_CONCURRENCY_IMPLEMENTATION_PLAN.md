# Phase 2 Audit, Outbox, and Tenant-Switch Concurrency Implementation Plan

**Status:** Phase 2 analysis complete; implementation and real Windows runtime evidence for this workstream are not yet complete.

**Scope:** Phase 2 only. This plan covers real PostgreSQL audit-control verification, real Redis/BullMQ outbox delivery verification, and real API tenant-switch concurrency verification. It does not begin Phase 3 and does not establish production readiness.

## 1. Evidence boundary

The repository already contains deterministic tests and a previously verified advanced outbox runtime pattern. Those artifacts establish implementation intent and safe test topology, but they are not substitutes for the next real Windows runtime campaign. A new runtime result will be recorded only after the exact script exists, the required static gates pass, the API and worker run against the existing database, the bounded markers are captured, and cleanup is verified without resetting or recreating data.

The required Windows topology is the actual repository checkout on Windows 11 with Docker Desktop, PostgreSQL 16, Redis 7, MinIO, Keycloak, the API process, and the worker process. The API owns scheduled outbox dispatch, while the worker owns BullMQ job processing. Both application processes are required for a delivery assertion.

## 2. Implementation findings

### 2.1 Audit-event persistence

The additive migration `20260823160000_phase2_audit_event_foundation` creates `AuditEvent` with event-type, UUID, payload-hash, metadata-size, retention, membership-scope, and target-pair constraints. It installs the `prevent_audit_event_mutation()` trigger for updates and deletes, enables forced row-level security, restricts ordinary access, and provides separate global-control, tenant, and retention policies. The migration is additive and does not drop, truncate, or rewrite existing data.

`AuditService.recordInTransaction()` normalizes an allowlisted event, computes a canonical SHA-256 payload hash, inserts the audit row, creates the linked outbox message in the same transaction, and records bounded metrics. Tenant-scoped audit events require the actor user, actor membership, and tenant identifiers. `purgeExpired()` uses the dedicated audit-retention context, records the privileged purge event, and deletes only expired rows without legal hold.

### 2.2 Outbox delivery

`OutboxService.claimBatch()` reclaims expired processing leases, dead-letters exhausted leases, claims pending or failed rows with `FOR UPDATE SKIP LOCKED`, increments attempts, and assigns a lease token. `OutboxWorker` resolves the registered handler inside the message scope, marks a message processed only after handler success, ignores already processed or dead-lettered duplicate jobs, skips stale lease jobs, and records retry or dead-letter state after handler failure.

`AuditOutboxHandler` is intentionally idempotent. It allowlists event types and validates the audit-event reference, event type, and tenant scope against the persisted `AuditEvent`. It does not create a second audit event during delivery.

The existing `outbox-advanced-runtime-check.mjs` and the canonical legacy-boundary evidence document establish the required observation pattern: API and worker must run together; transient `PROCESSING` state must not be required when fast retry can move a row through that state before polling; durable attempt and lease replacement evidence is the correct assertion.

### 2.3 Tenant-switch compare-and-set

`MembershipService.switchTenant()` performs membership-selection under a cleared tenant context, requires an active user, active in-window membership, and active tenant, then updates one active `AppSession` row using the observed `contextVersion`. A concurrent update produces a controlled tenant-switch conflict and cannot return a context based on a stale version. The HTTP route uses the global Phase 2 envelope/idempotency interceptor and explicitly returns HTTP 200 for a successful switch.

## 3. Required runtime assertions

| Boundary | Real assertion | Safe cleanup requirement |
|---|---|---|
| Append-only audit row | Updating or deleting a normal audit row is rejected by the trigger/RLS boundary | Test row remains retained as audit evidence or is removed only through the approved retention path |
| Audit tenant isolation | A tenant-scoped read/write is visible only inside the matching tenant context; global control is required for global audit access | Restore the test tenant to an archived state without deleting audit evidence |
| Retention | An expired, non-held row is purgeable only through the retention context and its purge event is written | Verify no expired test row remains after the approved purge |
| Legal hold | An expired row with legal hold remains present and is not purged | Retain or explicitly release only the generated fixture under the approved path |
| Audit outbox success | A real audit event creates one linked outbox row and reaches `PROCESSED` through API dispatch and the worker | Verify linked row and audit row counts; no duplicate audit event is created |
| Duplicate delivery | Two jobs for a processed audit outbox row complete without changing processed attempts or creating an audit duplicate | Remove only generated queue jobs if still present |
| Retry and dead letter | A registered failure path produces retry state, then `DEAD_LETTER` at the configured attempt boundary | Verify final state and remove only generated outbox fixtures through the dispatcher context |
| Tenant-switch concurrency | Two valid requests use the same session and expected version; exactly one wins and the loser receives the controlled conflict | Archive generated tenants and clear active session context; retain audit evidence intentionally |

## 4. Implementation contract

The next implementation will add one real runtime verifier at `backend/api/scripts/audit-outbox-concurrency-runtime-check.mjs` and one API package command named `db:phase2:reliability`. The verifier will use generated UUIDv4 fixtures, the real API HTTP route, real PostgreSQL, real Redis/BullMQ, and the existing API dispatcher plus worker topology. It will not reset the database, truncate tables, edit migration history, delete existing rows, recreate containers, or touch protected environment files.

The verifier will keep runtime output bounded. It will emit only the following marker families after each assertion has passed: `audit_append_only_status`, `audit_rls_status`, `audit_retention_status`, `audit_legal_hold_status`, `audit_outbox_delivery_status`, `audit_outbox_duplicate_status`, `audit_outbox_retry_status`, `audit_outbox_dead_letter_status`, `tenant_switch_concurrency_status`, and the final `phase2_reliability_runtime_result`. Failure output will include only a bounded allowlisted stage and error class; it will not print identifiers, tokens, cookies, request bodies, database URLs, credentials, or raw audit payloads.

The concurrency test will use two valid active tenants and memberships for one real authenticated user. It will issue two independent HTTP requests against the same session and expected context version, then assert one HTTP 200 success and one HTTP 409 `TENANT_SWITCH_CONFLICT`, followed by a session read that proves the winning server-derived context is the only active context. This proves the compare-and-set boundary rather than merely testing the service method in isolation.

## 5. Static and runtime sequence

The implementation must first pass verifier syntax, API Jest, API build, lint, and `git diff --check`. The exact diff must contain only the new verifier, package command, tests required by the implementation, and canonical Phase 2 documentation. After publication, Windows synchronization must begin with `git status --short` from the actual repository root and use only `git pull --ff-only origin phase2/legacy-tenant-boundaries`. The required frozen install, Prisma generation, migration deploy, build, and syntax gates must complete successfully before application startup.

The Windows runtime sequence is API and worker startup, one verifier execution, bounded marker capture, and safe cleanup confirmation. If a stage fails, the failure remains a failure; no later marker is inferred. A successful runtime result will be documented with the exact markers, environment and topology qualification, cleanup outcome, and remaining Phase 2 gaps.

## 6. Remaining boundaries after this workstream

Even a complete pass of this workstream will not close Phase 2. Explicit remaining boundaries include full authorization policy and MFA assurance, onboarding and invitation administration, generated-client verification, frontend English/Arabic RTL/LTR behavior, broader abuse and identity-data lifecycle controls, full integration topology and hosted CI evidence, and the future supported Linux KMS/object-storage/TLS/operational deployment boundary. Phase 3 remains not started.

## References

1. [`MEMBERSHIP_TENANT_SWITCH_IMPLEMENTATION_PLAN.md`](MEMBERSHIP_TENANT_SWITCH_IMPLEMENTATION_PLAN.md)
2. [`INTEGRATION_TEST_TOPOLOGY.md`](INTEGRATION_TEST_TOPOLOGY.md)
3. [`LEGACY_TENANT_BOUNDARY_IMPLEMENTATION.md`](LEGACY_TENANT_BOUNDARY_IMPLEMENTATION.md)
4. [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md)
5. [`../../skills/engineering-governance/SKILL.md`](../../skills/engineering-governance/SKILL.md)
