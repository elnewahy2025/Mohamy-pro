# Phase 2 One-Time Tenant Bootstrap Implementation

**Status:** Verified for implementation, static gates, unit tests, migration, and live Neon
runtime verification in the staged slice scope; the full Phase 2 workstream remains open for the
other tenancy, authorization, abuse-control, API-contract, and frontend gates.

**Date:** 2026-08-30

**Revision:** `e32ee1b6`

**Scope:** The operator-controlled one-time Platform bootstrap per
[`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md) (§Tenant
bootstrap): a fail-closed `POST /api/v1/bootstrap` that creates the first `Tenant`/`Organization`
hierarchy, the initial global `platform.admin` assignment and tenant `tenant.admin` role, an
append-only success audit event, and a non-repeatable `PlatformBootstrap` marker — in one
transaction.

## Architecture notes

The bootstrap slice is implemented to the frozen decision text (no silent simplification). It is
delivered as a sibling to the audit-foundation + tenant-switch slice and reuses its
`AuditEventService`/`OutboxService` and the RLS tenant-context helper.

- `POST /api/v1/bootstrap` (versioned under `api/v1` via `@Controller('bootstrap')`) is guarded by
  `SessionGuard` + `CsrfGuard`. The request body carries **only** the one-time secret; all
  identity (tenant/org) is environment-only `BOOTSTRAP_*` configuration.
- The service fails closed: the authenticated OIDC subject must equal `BOOTSTRAP_SUBJECT`, MFA
  must be verified within `BOOTSTRAP_MFA_MAX_AGE_SECONDS` (default 900), and the secret is
  compared in constant time. A missing aggregate `BOOTSTRAP_*` config returns `503
  BootstrapNotConfiguredError`.
- On success a single `withTenantContext` transaction creates: `Tenant`, `Organization`,
  `Membership`, the global `platform.admin` Role (found-or-create) + `GlobalRoleAssignment`, the
  tenant `tenant.admin` Role + `MembershipRole`, the `PlatformBootstrap` marker, the
  `tenant.bootstrap.succeeded` audit event, and the `tenant.bootstrap.succeeded` outbox message.
  All four pre-generated identifiers are valid v4 UUIDs, satisfying
  `assertTenantTransactionContext`.
- Invalidation: only the SHA-256 of the one-time secret is stored (`secretHash`). The marker is a
  singleton enforced at the database level (`UNIQUE` + `CHECK (singleton = true)`), so a second
  marker is impossible even under a concurrent bootstrap race. Any repeat invocation is refused
  with a non-enumerating `BootstrapDeniedError` (`403 FORBIDDEN`, internal reason
  `ALREADY_BOOTSTRAPPED`) and audited as `tenant.bootstrap.denied`.
- The denied path writes under `withMembershipSelectionContext` (user identity only), so audit
  writes and the database gate work before any tenant context exists; the table is intentionally
  a global (no-RLS, `FORCE` off) table so the marker is readable before any tenant exists.
- Files: `backend/api/src/bootstrap/{bootstrap.constants,bootstrap.config,bootstrap.errors,
  bootstrap.dto,bootstrap.service,bootstrap.controller,bootstrap.module}.ts` plus `spec.ts`
  tests, registered in `app.module.ts`.

### Migration

`20260831000000_tenant_bootstrap_foundation` is **additive** and global: it creates only the
`"PlatformBootstrap"` table (no RLS), its `UNIQUE`+`CHECK` singleton gate, two foreign keys to
`"User"`/`"Tenant"`, and two auxiliary indexes. It alters or drops no pre-existing object and is
consistent with the Phase 2 "additive migration only" and `MIGRATION_POLICY.md` constraints.

### Audit/outbox vocabulary

- `tenant.bootstrap.succeeded` → `AUDIT`, v1, default `SUCCEEDED`, metadata allowlist
  `['tenantSlug','organizationSlug']`.
- `tenant.bootstrap.denied` → `SECURITY`, v1, default `DENIED`, metadata allowlist `['reason']`.
- Added to `AUDIT_EVENT_TYPES`, `AUDIT_EVENT_VERSIONS`, `AUDIT_CATEGORY`, `AUDIT_DEFAULT_OUTCOME`,
  and `METADATA_ALLOWLIST`.

## Verification status

| Verification | Result | Evidence boundary |
|---|---|---|
| Prisma schema validation | PASS | `prisma validate` reports the schema is valid. |
| Prisma client generation | PASS | `prisma generate` regenerated the client including the `PlatformBootstrap` model (self-hosted store path). |
| API build | PASS | `nest build` exited 0. |
| Focused new tests | PASS | **25 tests / 3 suites** for the bootstrap feature + `BOOTSTRAP_*` env validation (14 bootstrap + 4 env-validation additions, plus pre-existing env tests). |
| Full API unit suite | PASS | `jest --silent` passed **31 suites / 154 tests** (baseline 136 before this slice). |
| API lint | PASS | `eslint` on new/modified files: 0 errors (only `no-unsafe-*` warnings from `as any` mocks, consistent with existing code). |
| Migration applied on Neon | PASS | `prisma migrate deploy` applied `20260831000000_tenant_bootstrap_foundation`. |
| Repo migration consistency | PASS | `node scripts/check-migrations.mjs`: "9 repository migration(s), 9 applied migration(s)." |
| Singleton gate (database) | PASS | Live introspection: `UNIQUE` constraint `PlatformBootstrap_singleton` + `CHECK` `PlatformBootstrap_singleton_check` both present. |
| Table is global/no-RLS | PASS | Live introspection: `relrowsecurity=false, relforcerowsecurity=false`. |
| Runtime (live Neon) | PASS | First bootstrap succeeded and created the full hierarchy + marker + audit + outbox; repeat and wrong-subject invocations were refused (`ALREADY_BOOTSTRAPPED`) and a `tenant.bootstrap.denied` audit written. See [`HOSTED_TENANT_BOOTSTRAP_RUNTIME_VERIFICATION.md`](HOSTED_TENANT_BOOTSTRAP_RUNTIME_VERIFICATION.md). |

## Runtime evidence (live Neon)

Full live evidence (migration deploy, `check-migrations`, `"PlatformBootstrap"` columns /
constraints / indexes / RLS, outcome row counts, and the bootstrap → repeat-refuse →
wrong-subject-refuse sequence) is recorded in
[`HOSTED_TENANT_BOOTSTRAP_RUNTIME_VERIFICATION.md`](HOSTED_TENANT_BOOTSTRAP_RUNTIME_VERIFICATION.md).
The live outcome was: **1 marker** (`singleton=true`), **1** `tenant.bootstrap.succeeded` audit,
**2** `tenant.bootstrap.denied` audits, **1** `tenant.bootstrap.succeeded` outbox message,
**1** global role assignment, **1** membership role, and the `bootstrap-tenant` hierarchy.

## Scope boundary

This evidence closes the tenant-bootstrap slice for its database- and service-path behavior. It
does not close: a full browser/Keycloak HTTP round-trip of `POST /api/v1/bootstrap` (requires a
real OIDC login + MFA on the user's machine); the legacy-table tenant boundaries (`StorageObject`,
`OutboxMessage`, `IdempotencyKey` callers); membership/invitation endpoints; the full RBAC
matrix; the remaining abuse controls; the full API contract; or the bilingual frontend. A
downstream handler for the `tenant.bootstrap.succeeded` outbox message is not registered yet
(created same-transaction; the worker will log no-handler and retry/fail by design). These remain
mandatory follow-on work tracked in [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md).