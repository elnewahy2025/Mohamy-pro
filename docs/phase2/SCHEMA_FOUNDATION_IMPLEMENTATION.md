# Phase 2 Identity and Tenancy Schema Foundation

**Status:** Implemented in the repository; Windows database deployment and runtime behavior remain to be verified.

**Date:** 2026-08-22

**Migration:** `20260822190000_identity_tenancy_foundation`

## Scope

The first Phase 2 implementation slice adds the normalized identity and tenant hierarchy required by the approved preflight decisions. It preserves the existing Phase 1 tables and adds nullable tenant references to existing `StorageObject` and `OutboxMessage` records so later tenant enforcement can be introduced without corrupting legacy rows. It adds a foreign-key relation from the existing `IdempotencyKey.userId` field to `User`; the field remains nullable for existing and protocol-exception records.

The new application models are:

| Model | Purpose | Scope |
|---|---|---|
| `User` | Global application identity and lifecycle | Global; no provider password or MFA secret |
| `ExternalIdentity` | Immutable `(provider, subject)` mapping | Global identity service |
| `AppSession` | Opaque-cookie application session, expiry, revocation, MFA state | Global session service with optional active tenant context |
| `Tenant` | Ordinary data-security boundary | Global catalog with named policy access |
| `Organization` | Tenant operating grouping | Tenant-owned |
| `Branch` | Organization location grouping | Tenant-owned |
| `Department` | Branch functional grouping | Tenant-owned |
| `Team` | Flexible assignment construct, not a security boundary | Tenant-owned |
| `Membership` | User-to-tenant binding and context authority | Tenant-owned |
| `TeamMember` | Membership assignment to a team | Tenant-owned |
| `Invitation` | Single-use tenant onboarding state | Tenant-owned |
| `Permission` | Global immutable permission catalog | Global catalog |
| `Role` | Global or tenant-scoped role catalog | Global or tenant-owned |
| `RolePermission` | Role-to-permission relation | Catalog assignment |
| `MembershipRole` | Tenant membership role assignment | Tenant-owned |
| `GlobalRoleAssignment` | Global Platform Admin assignment | Global privileged assignment |
| `AccessDenial` | Explicit tenant denial state | Tenant-owned |

## Database integrity

The schema includes foreign keys, composite tenant-consistency keys, unique normalized identifiers, lifecycle enums, active-window checks, invitation identity-binding checks, session active-context pairing checks, and role-scope checks. A partial unique index ensures global role keys are unique; tenant role keys are unique within their tenant.

The migration creates eight lifecycle enums, seventeen new tables, two additive alterations to existing Phase 1 tables, forty-nine generated indexes, thirty-one foreign keys, and the reviewed manual check/index constraints. A destructive SQL scan returned no `DROP TABLE`, `DROP INDEX`, `TRUNCATE`, `DELETE FROM`, or destructive alteration of an existing Phase 1 table.

The existing Windows `mohamy_pro` data remains protected by additive nullable changes and foreign-key additions. No row copy, reset, volume deletion, migration-history edit, or destructive backfill is part of this migration. Existing records retain null tenant scope until a later reviewed ownership/backfill migration defines the safe mapping.

## Verification executed in the sandbox

| Command | Result |
|---|---|
| `pnpm --filter api exec prisma format` | PASS |
| `pnpm --filter api exec prisma validate` | PASS |
| `pnpm --filter api exec prisma generate` | PASS |
| `pnpm --filter api run build` | PASS |
| `pnpm --filter api exec jest --runInBand` | PASS — 11 suites, 32 tests |
| `pnpm --filter api exec eslint 'src/**/*.ts' 'test/**/*.ts'` | PASS |
| `git diff --check` | PASS |
| Windows `pnpm --filter api exec prisma migrate deploy` against existing `mohamy_pro` | PASS — migration `20260822190000_identity_tenancy_foundation` applied successfully |
| Disposable PostgreSQL migration deployment | NOT EXECUTED in the sandbox because no reachable PostgreSQL service was configured |

The passing checks above verify schema parsing, client generation, compilation, existing unit coverage, lint, migration SQL review, and successful application of the new migration to the existing Windows PostgreSQL database. They do not yet prove the new tables, constraints, composite foreign keys, or data-preservation properties through direct post-migration queries, nor do they prove fresh-database reproducibility.

## Required next verification

**API is stopped. Worker is stopped.** From the Windows repository root, after pulling the published schema migration, the existing-data migration command and direct schema inspection were run and passed as recorded below. The fresh-database rerun remains required:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
git status --short
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate deploy
```


Captured Windows migration output:

```text
5 migrations found in prisma/migrations

Applying migration `20260822190000_identity_tenancy_foundation`

The following migration(s) have been applied:

migrations/
  └─ 20260822190000_identity_tenancy_foundation/
    └─ migration.sql

All migrations have been successfully applied.
```

The existing `mohamy_pro` database was not reset or manually edited. The evidence records the migration name and successful result without displaying credentials or data contents.

The direct Windows post-migration inspection was then executed with the API and worker stopped. It returned the applied migration with a finished timestamp and no rollback, all 17 Phase 2 tables, all five manual integrity constraints, the four expected additive columns, and these existing-table row counts: `Health=0`, `IdempotencyKey=0`, `OutboxMessage=0`, and `StorageObject=3`. The existing `StorageObject` rows remained present after migration. No reset, row deletion, migration-history edit, volume deletion, or destructive backfill was used.

A separate disposable PostgreSQL database must still apply all migrations from an empty state and run the migration checker. The first manual attempt exposed a PowerShell interpolation defect that created a temporary database named `=public`; that temporary database was dropped and the existing `mohamy_pro` database was not touched. The corrected first-party runner below prevents that defect and must be used for the accepted rerun. Only after the fresh-database gate passes can this schema slice be marked fully verified.

**API is stopped. Worker is stopped.** From the Windows repository root, run:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
.\backend\api\scripts\phase2-fresh-database-runtime-check.ps1
```

Expected result:

```text
fresh_database_result=PASS
```

The runner creates only a generated database name with the `mohamy_phase2_fresh_` prefix, applies all repository migrations, runs `db:check`, restores the prior `DATABASE_URL`, and drops only that generated database. It refuses to use or remove the existing `mohamy_pro` database.

## Remaining implementation boundaries

This migration does not claim that RLS policies, authentication guards, application sessions, tenant-context middleware, invitation services, authorization policies, audit-event persistence, API envelopes, idempotency correction, or frontend identity flows are implemented. Those are later Phase 2 workstreams. The nullable tenant fields on Phase 1 tables are an additive foundation; they are not a tenant-isolation claim until the approved RLS/compensating-control workstream is implemented and tested.

## References

1. [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md)
2. [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md)
3. [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)
4. [`RLS_TENANT_ENFORCEMENT_DECISION.md`](RLS_TENANT_ENFORCEMENT_DECISION.md)
5. [`PHASE2_BASELINE_VERIFICATION.md`](PHASE2_BASELINE_VERIFICATION.md)
6. [`Phase 0 database policy`](../phase0/DATABASE.md)
7. [`Phase 0 threat model`](../phase0/THREAT_MODEL.md)
