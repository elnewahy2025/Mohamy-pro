# Phase 2 RLS and Tenant-Context Implementation

**Status:** Implementation slice complete for static gates and unit coverage; real PostgreSQL runtime evidence is still required before this workstream can close.

**Date:** 2026-08-22

**Scope:** Transaction-local application context and the first fail-closed PostgreSQL RLS migration for Phase 2 tenant-owned tables.

## Implementation summary

The API now exposes one database boundary for ordinary tenant transactions through `PrismaService.withTenantContext`. The helper validates all four required identifiers as UUIDs before a database transaction is opened, starts a Prisma interactive transaction, and establishes `app.tenant_id`, `app.user_id`, `app.membership_id`, and `app.operation_id` with parameterized PostgreSQL `set_config(..., true)` calls. The third argument is `true`, so the settings are transaction-local and are cleared by PostgreSQL on commit or rollback. No session-level `SET`, process-global tenant variable, connection-pool default, or async-local value is used as the database control.

A separate `withMembershipSelectionContext` helper supports the pre-switch candidate-membership transaction. It validates the authenticated user and operation identifiers, explicitly clears `app.tenant_id` and `app.membership_id`, and sets only the user and operation settings. This prevents candidate-membership inspection from inheriting a tenant scope through pooled-connection reuse. The helper is intended to be called only after authentication and before the target membership is accepted; it does not itself authorize a switch.

The implementation is in [`backend/api/src/infrastructure/database/prisma.service.ts`](../../backend/api/src/infrastructure/database/prisma.service.ts) and [`backend/api/src/infrastructure/database/tenant-context.ts`](../../backend/api/src/infrastructure/database/tenant-context.ts). The focused tests are in [`backend/api/src/infrastructure/database/tenant-context.spec.ts`](../../backend/api/src/infrastructure/database/tenant-context.spec.ts).

## RLS migration scope

Migration `20260822200000_rls_tenant_context_foundation` creates the database-side `public.app_tenant_context_is_valid()` predicate and enables both `ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on the following eleven Phase 2 tenant-owned tables:

| Table | Policy | Security boundary |
|---|---|---|
| `Organization` | `Organization_tenant_isolation` | `tenantId = app.tenant_id` and valid context |
| `Branch` | `Branch_tenant_isolation` | `tenantId = app.tenant_id` and valid context |
| `Department` | `Department_tenant_isolation` | `tenantId = app.tenant_id` and valid context |
| `Team` | `Team_tenant_isolation` | `tenantId = app.tenant_id` and valid context |
| `Membership` | `Membership_tenant_isolation` plus `Membership_authenticated_user_selection` | Tenant reads/writes require `tenantId = app.tenant_id` and valid context; the pre-switch read policy allows only the authenticated user’s memberships and never writes |
| `TeamMember` | `TeamMember_tenant_isolation` | `tenantId = app.tenant_id` and valid context |
| `Invitation` | `Invitation_tenant_isolation` | `tenantId = app.tenant_id` and valid context |
| `Role` | `Role_global_or_tenant_isolation` | Global catalog rows remain visible; tenant role rows require the active context |
| `MembershipRole` | `MembershipRole_tenant_isolation` | `tenantId = app.tenant_id` and valid context |
| `RolePermission` | `RolePermission_global_or_tenant_isolation` | Scope is inherited from the referenced global or tenant role |
| `AccessDenial` | `AccessDenial_tenant_isolation` | `tenantId = app.tenant_id` and valid context |

Each policy has both a `USING` predicate for reads and an equivalent `WITH CHECK` predicate for inserts and updates. A missing, empty, malformed, or incomplete context therefore cannot widen access and cannot authorize a tenant-owned insert. The hierarchy’s composite foreign keys remain the database control that rejects a child row whose parent belongs to another tenant.

`User`, `ExternalIdentity`, `AppSession`, `Tenant`, `Permission`, and `GlobalRoleAssignment` remain outside RLS in this slice exactly as required by the approved matrix. They require named identity, session, tenant-catalog, or privileged-operator repository policies before ordinary endpoints are added. The migration does not add permissive policies to these global tables.

`StorageObject`, `OutboxMessage`, and `IdempotencyKey` are intentionally unchanged by this migration. Their Phase 1 callers still operate on legacy rows with nullable tenant ownership, and enabling RLS before those callers are moved behind tenant-aware repositories would either break approved operational behavior or invite an unsafe `tenantId IS NULL` bypass. This is a staged boundary, not a final tenant-isolation claim. Those three tables remain mandatory follow-on work before the Phase 2 tenant-isolation matrix can close.

## Verification status

| Verification | Result | Evidence boundary |
|---|---|---|
| Prisma schema validation | PASS | The current Prisma schema validates. |
| Prisma client generation | PASS | Prisma Client generated successfully after the helper and migration were added. |
| API build | PASS | `pnpm --filter api run build` completed successfully. |
| Focused tenant-context tests | PASS | 10 tests cover UUID validation, malformed values, pre-membership clearing, parameter binding, and callback-failure propagation. |
| Full API unit suite | PASS | 12 suites and 42 tests passed in the sandbox. |
| API lint | PASS | `pnpm --filter api exec eslint 'src/**/*.ts' 'test/**/*.ts'` completed successfully. |
| Whitespace/diff check | PASS | `git diff --check` completed successfully. |
| Migration destructive scan | PASS | No `DROP TABLE`, `DROP INDEX`, `DROP TYPE`, `DROP COLUMN`, `TRUNCATE`, or `DELETE FROM` was found in the new migration. |
| Disposable PostgreSQL RLS runtime | BLOCKED IN SANDBOX | The sandbox has no PostgreSQL `DATABASE_URL`; Windows Docker execution is required. |
| Existing Windows database migration | PENDING USER EXECUTION | The additive RLS migration must be applied to `mohamy_pro` without reset or migration-history edits. |

The static and unit results do not prove PostgreSQL behavior. The first Windows attempt reached the runner but stopped at the child-process boundary with `spawnSync pnpm.cmd EINVAL`; this was a Windows process-launch defect, not an RLS result. The Windows-safe runner then successfully applied all six repository migrations and reported `rls_metadata_status=PASS|tables=11|policies=12`, but its disposable Tenant fixture omitted the required `updatedAt` value and stopped before the behavioral checks. After that correction, the next run reached the Membership seed and found the same required `updatedAt` field omitted there. After both fixture corrections, the verifier reached its first behavioral check and returned two organizations without context. That result exposed a verifier-design defect: the configured database account can bypass RLS, so an owner/superuser connection cannot prove default deny. The verifier now creates and uses a generated `LOGIN NOSUPERUSER NOBYPASSRLS` role with scoped grants before running behavioral checks. These fixture and verifier-boundary defects did not change the existing `mohamy_pro` data. The runtime acceptance remains open until the corrected non-bypass run provides direct evidence for default deny, malformed context, Tenant A/Tenant B isolation, hierarchy foreign-key rejection, rollback, and reuse of the same pooled connection after transaction-local settings have cleared.

## Safe Windows verification sequence

**Before every command block below:** keep the API terminal stopped and the worker terminal stopped. Keep only the existing PostgreSQL container running, along with other Docker containers that are already part of the user’s environment. Do not stop, remove, recreate, reset, or delete any unrelated container or volume.

Run from the actual repository root. Before pulling, inspect the working tree and preserve any local Compose modification and protected untracked files. Do not paste a database URL, password, license, or protected environment value into chat.

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
git status --short
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm --filter api exec prisma generate

if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    throw 'DATABASE_URL is not set in this PowerShell session. Set the local secret without displaying it, then rerun this block.'
}

pnpm --filter api exec prisma migrate deploy
```

The migration command above targets the configured existing database. It is additive and must report that the new migration was applied without any reset. Existing Phase 1 data must remain present. If the working tree contains a conflicting local change and fast-forward pull refuses to proceed, stop and preserve the work; do not reset, restore, stash, or overwrite it.

After the existing-database migration completes, run the disposable runtime verifier in the same repository root and PowerShell session:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    throw 'DATABASE_URL is not set in this PowerShell session. Set the local secret without displaying it, then rerun this command.'
}
pnpm --filter api run db:phase2:rls
```

The verifier creates a generated database whose name begins with `mohamy_phase2_rls_fresh_`, applies the complete repository migration directory, seeds only disposable rows, creates a generated `LOGIN NOSUPERUSER NOBYPASSRLS` database role, grants it only the permissions needed for the RLS checks, runs the checks through that role, and drops both the generated database and generated role. It expects eleven RLS-protected tables and twelve policies because `Membership` has both the tenant-isolation policy and the read-only pre-switch policy. It refuses to target `mohamy_pro`. A successful run must include the following result markers:

```text
rls_runtime_role_status=PASS|superuser=false|bypassrls=false
rls_metadata_status=PASS|tables=11|policies=12
rls_default_deny_status=PASS|tenant_only_tables=9|missing_context_reads=0|missing_context_insert=DENIED
rls_membership_selection_status=PASS|user_a_own_membership=1|other_user_membership=0
rls_role_scope_status=PASS|tenant_a_sees_own_role=1|tenant_a_sees_b_role=0|tenant_a_sees_own_permission=1|tenant_a_sees_b_permission=0
rls_tenant_isolation_status=PASS|tenant_a_sees_a=1|tenant_a_sees_b=0
rls_malformed_context_status=PASS|read=0|insert=DENIED
rls_hierarchy_integrity_status=PASS|cross_tenant_parent=DENIED
rls_transaction_rollback_status=PASS|rolled_back_team_rows=0
rls_pool_reuse_status=PASS|tenant_a_to_b_context_reset=true|tenant_b_sees_a=0
```

The verifier must also print a final line beginning `rls_runtime_result=PASS|database=mohamy_phase2_rls_fresh_`; its timestamp and random suffix are generated per run and must not be manually supplied.

The generated database identifier is safe to share as evidence. Do not share the `DATABASE_URL` value or any credential-bearing command output.

## Acceptance boundary

This document closes the implementation and static-verification slice only. It does **not** close the full RLS workstream, Phase 2, or production deployment. Full closure still requires real Windows PostgreSQL runtime output, integration of the helper into authenticated tenant repositories, worker tenant context propagation, staged enforcement for `OutboxMessage`, `IdempotencyKey`, and `StorageObject`, and the remaining identity, authorization, audit, API contract, abuse-control, and frontend gates in [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md). The qualified production boundary remains unchanged: Windows Docker is the approved development/verification plane, while unqualified production deployment remains open pending the future supported Linux KMS/object-storage plane.

## References

1. [`RLS_TENANT_ENFORCEMENT_DECISION.md`](RLS_TENANT_ENFORCEMENT_DECISION.md)
2. [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md)
3. [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)
4. [`SCHEMA_FOUNDATION_IMPLEMENTATION.md`](SCHEMA_FOUNDATION_IMPLEMENTATION.md)
5. [`../../skills/engineering-governance/SKILL.md`](../../skills/engineering-governance/SKILL.md)
