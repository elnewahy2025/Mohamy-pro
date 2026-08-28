# Phase 2 Hosted RLS Runtime Verification

**Date:** 2026-08-28

**Repository revision:** current working tree of `Mohamy-Backup` (elnewahy2025/Mohamy-Backup).

**Environment:** Linux sandbox. Runtime verification executed against **hosted Neon PostgreSQL 18.6** (no local PostgreSQL/Docker). Disposable database and verifier role were created, exercised, and removed on Neon only. The real `neondb`/`mohamy_pro` database was never mutated by this check.

## Purpose

Produce runtime (database-gated) evidence for the Phase 2 RLS tenant-context foundation, verifying that row-level security actually enforces tenant isolation at the database layer, not just in application code.

## Command executed

Working directory: `backend/api`

```text
DATABASE_URL=<extracted from gitignored backend/api/.env> node scripts/phase2-rls-runtime-check.mjs
```

Note: `DATABASE_URL` is read from the environment by the verifier. The value was exported from the gitignored `backend/api/.env`; the connection string is not printed or stored in this evidence document.

## Behavior of the verifier

- Connects to the Neon admin (`/postgres`) database using the configured credentials.
- Creates a disposable database `mohamy_phase2_rls_fresh_*` and a disposable non-bypass RLS verifier role `mohamy_phase2_rls_verifier_*`.
- Applies all six migrations to the disposable database.
- Seeds disposable rows and exercises the RLS tenant context via raw SQL under the restricted verifier role.
- Drops the disposable database and role in cleanup.
- Refuses to operate on `mohamy_pro` (safety check).

## Results

Migrations applied to the disposable database (all 6):

```text
Applying migration `00000000000000_init`
Applying migration `20260820190000_outbox_delivery_semantics`
Applying migration `20260821000000_repair_baseline_indexes`
Applying migration `20260821160000_storage_security_metadata`
Applying migration `20260822190000_identity_tenancy_foundation`
Applying migration `20260822200000_rls_tenant_context_foundation`
All migrations have been successfully applied.
```

Runtime RLS checks:

```text
rls_metadata_status=PASS|tables=11|policies=12
rls_runtime_role_status=PASS|superuser=false|bypassrls=false
rls_default_deny_status=PASS|tenant_only_tables=9|missing_context_reads=0|missing_context_insert=DENIED
rls_membership_selection_status=PASS|user_a_own_membership=1|other_user_membership=0
rls_role_scope_status=PASS|tenant_a_sees_own_role=1|tenant_a_sees_b_role=0|tenant_a_sees_own_permission=1|tenant_a_sees_b_permission=0
rls_tenant_isolation_status=PASS|tenant_a_sees_a=1|tenant_a_sees_b=0
rls_malformed_context_status=PASS|read=0|insert=DENIED
rls_hierarchy_integrity_status=PASS|cross_tenant_parent=DENIED
rls_transaction_rollback_status=PASS|rolled_back_team_rows=0|post_rollback_no_context_org_rows=0
rls_pool_reuse_status=PASS|tenant_a_to_b_context_reset=true|tenant_b_sees_a=0
rls_runtime_result=PASS|database=mohamy_phase2_rls_fresh_*
```

## Cleanup note

The verifier reported a single non-fatal cleanup message on the `DROP OWNED BY` step:

```text
rls_role_cleanup_result=FAIL|error=permission denied to drop objects
```

This occurs only after the generated database has already been dropped, so there are no owned objects left to drop in the `postgres` database. Subsequent verification against Neon confirmed zero leftover objects:

```text
Databases matching 'mohamy_phase2%'            : (0 rows)
Roles    matching 'mohamy_phase2_rls_verifier%': (0 rows)
Database 'mohamy_priv_test'                    : (0 rows)
```

No generated database, verifier role, or test database remains in the Neon project. The real `neondb` database is untouched.

## Baseline decision

The RLS tenant-context foundation is **runtime-verified PASS against hosted Neon PostgreSQL**: all ten runtime RLS gates passed under a non-bypass role, and cleanup left no residue. This closes the earlier "database/runtime baseline OPEN" condition from `PHASE2_BASELINE_VERIFICATION.md` for the RLS foundation specifically.

Scope of this evidence: RLS enforcement of the tenant context at the database layer. Phase 2 application features (authentication, authorization engine, sessions, membership switching, audit persistence, frontend identity) remain to be implemented and are tracked separately.
