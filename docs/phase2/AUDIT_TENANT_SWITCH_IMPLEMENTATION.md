# Phase 2 Audit Foundation and Tenant-Switch Implementation

**Status:** Verified for implementation, static gates, unit/contract tests, and live Neon runtime
verification in the staged slice scope; the full Phase 2 workstream remains open for the other
tenancy, authorization, abuse-control, API-contract, and frontend gates.

**Date:** 2026-08-30

**Scope:** Append-only audit/security event persistence, the transactional `AuditEventService`, the
idempotent audit outbox confirmation handler, and the authenticated `POST
/api/v1/session/tenant-switch` endpoint with server-side active-membership verification and
non-enumerating denial.

## Architecture notes

The audit and tenant-switch slices are delivered together as one decision-authorized unit
(`AUDIT_EVENT_FOUNDATION_DECISION.md` and `TENANT_MEMBERSHIP_SWITCHING_DECISION.md`, both frozen
2026-08-22). No silent simplification away from those decisions was made.

### Audit store

- Migration `20260830000000_audit_event_foundation` is **additive**: it creates the `AuditCategory`
  and `AuditOutcome` enums and the `AuditEvent` table, four auxiliary indexes, three foreign keys,
  two RLS policies, an append-only reject-mutation trigger, and the
  `public.app_audit_global_scope_is_valid()` predicate. It alters or drops no pre-existing object.
- The event is written **in the same database transaction** as the state change it records.
- Append-only is enforced at the database layer by revoking `UPDATE`/`DELETE` from the runtime
  role and by the `AuditEvent_append_only` trigger, which raises an exception for any
  `UPDATE`/`DELETE` against a persisted event.
- RLS is `ENABLE` + `FORCE` on `AuditEvent`. Tenant-scoped events require the tenant transaction
  context (`AuditEvent_tenant_isolation`); global (`tenantId IS NULL`) events require the new
  global-scope predicate (`AuditEvent_global_scope`), which mirrors the membership-selection
  boundary but does not require a user identity.
- The `AuditEventService.write()` is transaction-aware, derives category/version/retention from
  the event vocabulary in `src/audit/audit-constants.ts`, and **fails closed** on a non-allowlisted
  or non-scalar metadata field rather than silently persisting it.
- The `AuditOutboxHandler` (`audit.event.created`) is a confirmation handler: the event row is
  already written transactionally at mutation time, so the handler verifies presence and
  correlation id and never re-creates the event, making duplicate outbox delivery harmless.

Files: `backend/api/src/audit/audit-constants.ts`, `audit-event.service.ts`, `audit.errors.ts`,
`audit-outbox.handler.ts`, `audit.module.ts`, plus `spec.ts` tests.

### Tenant switch

- `POST /api/v1/session/tenant-switch` (versioned under `api/v1`) is guarded by `SessionGuard` and
  `CsrfGuard` and is subject to the global idempotency interceptor.
- The candidate membership is read under the **read-only** `withMembershipSelectionContext`
  (user identity only, no tenant scope); switching requires an `ACTIVE` membership within its
  active window.
- The session `activeTenantId`/`activeMembershipId` update and the `tenant.switch.succeeded`
  audit event are written **atomically** under `withTenantContext` on the target tenant.
- A denied switch records a global-scope `tenant.switch.denied` audit event and throws a single
  non-enumerating `TenantSwitchDeniedError` (`403 FORBIDDEN`, fixed message) so an observer
  cannot distinguish a missing tenant, missing membership, suspended membership, or inactive
  window. The internal machine reason is retained only in the audit event and server logs, never
  the HTTP response.
- The idempotency actor-scope resolution was corrected to read `request.auth.userId` /
  `request.auth.activeTenantId` (set by `SessionGuard` before the interceptor runs) so the
  tenant-switch mutation is correctly scoped per user and per originating tenant.

Files: `backend/api/src/auth/session/tenant-switch.{dto,errors,service,controller}.ts` plus
`spec.ts` tests.

## Verification status

| Verification | Result | Evidence boundary |
|---|---|---|
| Prisma schema validation | PASS | `prisma validate` reports the schema is valid. |
| Prisma client generation | PASS | `prisma generate` regenerated the client including `AuditEvent`. |
| API build | PASS | `nest build` exited 0. |
| Focused new tests | PASS | 16 tests across audit service, audit outbox handler, tenant-switch service, tenant-switch controller. |
| Full API unit suite | PASS | `jest --runInBand` passed **29 suites / 136 tests** (baseline 119). |
| API lint | PASS | `eslint` on new/modified files: 0 errors (only `no-unsafe-*` warnings from `as any` mocks, consistent with existing code). |
| Web unit tests | PASS | `apps/web` vitest passed **2 files / 7 tests**. |
| Web type-check | PASS | `tsc --noEmit` (stable JS compiler) exited 0. Web `next build` fails only on a pre-existing Turbopack `Invalid symlink` environment issue in this sandbox, unrelated to these back-end-only changes. |
| Migration applied on Neon | PASS | `prisma migrate deploy` applied `20260830000000_audit_event_foundation`. |
| `prisma migrate status` | PASS | "Database schema is up to date!" — 8 migrations applied. |
| Repo migration consistency | PASS | `node scripts/check-migrations.mjs`: "8 repository migration(s), 8 applied migration(s)." |
| Migration additive (introspection) | PASS | Pre-deploy: `AuditEvent` absent, audit enums absent, 7 migrations. Post-deploy: `AuditEvent` present, both enums present, 8 migrations, 0 rows. |
| Audit object completeness | PASS | Post-deploy introspection shows 5 indexes, 3 FKs, 2 policies, `AuditEvent_append_only` trigger, RLS `enforced=true forced=true`. |
| Append-only fail-closed (live) | PASS | Global-scope `INSERT` under proper context succeeded; `UPDATE` and `DELETE` were rejected by the trigger; the row survived the rejected mutations; the test rolled back leaving 0 rows. |
| Rollback (live) | PASS | Compensating reverse-DDL (drop policies, trigger, functions, table, enums; disable RLS) succeeded inside a transaction and left production untouched on ROLLBACK (AuditEvent restored, migration still applied). |
| Existing Phase 2 RLS runtime check | PASS | All ten `phase2-rls-runtime-check` security gates passed; the audit migration applied cleanly first. Only the verifier's own teardown of a disposable database/role reported `FAIL` (open connection / Neon permission), unrelated to this additive migration. |

## Runtime evidence (live Neon)

Working directory: `backend/api`, `DATABASE_URL` exported from staging; the connection string is
not printed in this document.

### Pre-deploy state (evidence of additivity)

```text
Pre-deploy: AuditEvent regclass = [{"tbl":null}]
Pre-deploy: audit enums = []
Pre-deploy: migration rows = [{"n":7}]
```

### Deploy

```text
Applying migration `20260830000000_audit_event_foundation`
All migrations have been successfully applied.
```

### Post-deploy introspection

```text
Post-deploy: AuditEvent regclass = [{"tbl":"\"AuditEvent\""}]
Post-deploy: audit enums = [AuditCategory, AuditOutcome]
Post-deploy: migration rows = [{"n":8}]
Post-deploy: AuditEvent rows = [{"n":0}]
Post-deploy: triggers = [AuditEvent_append_only]
Post-deploy: RLS = [{"enforced":true,"forced":true}]
Post-deploy: policies = [AuditEvent_global_scope, AuditEvent_tenant_isolation]
Post-deploy: FKs = [AuditEvent_actorMembershipId_tenantId_fkey, AuditEvent_actorUserId_fkey, AuditEvent_tenantId_fkey]
Post-deploy: indexes = [AuditEvent_actorUserId_occurredAt_idx, AuditEvent_correlationId_idx, AuditEvent_pkey, AuditEvent_retentionUntil_idx, AuditEvent_tenantId_eventType_occurredAt_idx]
```

### Append-only fail-closed check (inside a rolled-back transaction)

```text
global-scope INSERT rows inserted = 1
UPDATE rejected = true
DELETE rejected = true
Row still present in txn after rejected UPDATE/DELETE = 1
Total AuditEvent rows after ROLLBACK = 0
```

### Rollback check (inside a rolled-back transaction)

```text
Rollback check: AuditEvent regclass = [{"tbl":null}]
Rollback check: audit enums remaining = 0
After rollback-check ROLLBACK: AuditEvent restored = "AuditEvent"
After rollback-check ROLLBACK: audit migration rows still applied = 1
```

### Phase 2 RLS runtime check (regression)

```text
rls_metadata_status=PASS
rls_runtime_role_status=PASS
rls_default_deny_status=PASS
rls_membership_selection_status=PASS
rls_role_scope_status=PASS
rls_tenant_isolation_status=PASS
rls_malformed_context_status=PASS
rls_hierarchy_integrity_status=PASS
rls_transaction_rollback_status=PASS
rls_pool_reuse_status=PASS
```

Cleanup note: the newer verifier left a disposable database/role because its teardown requires
dropping while no connection is open and higher privileges than the staging role holds; the ten
security gates themselves all passed and the additive audit migration applied cleanly. This
teardown limitation is independent of the audit migration, which creates no databases or roles.

## Scope boundary

This evidence closes the audit-foundation + tenant-switch slice only. It does not close the
legacy-table tenant boundaries (`StorageObject`, `OutboxMessage`, `IdempotencyKey` callers),
membership/invitation endpoints, the full RBAC matrix, the remaining abuse controls, the full
API contract, or the bilingual frontend. Those remain mandatory follow-on work tracked in
`PHASE2_IMPLEMENTATION_PLAN.md`. A full browser/Keycloak round-trip of the new endpoint is a
separate user-PC verification step.
