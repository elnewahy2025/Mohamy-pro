# Phase 2 Hosted Membership/Invitation Runtime Verification

**Date:** 2026-08-31

**Repository revision:** membership-invitation slice (see
`MEMBERSHIP_INVITATION_IMPLEMENTATION.md`).

**Environment:** Linux sandbox. Verification executed against **hosted Neon PostgreSQL** for the
live `mohamy_phase2_rls_fresh_*` database used by the Phase 2 runtime checks, exercising the real
RLS/tenant-context mechanism, real foreign keys, real permissions catalog, and real lifecycle
state transitions under the same `app.tenant_id` / `app.user_id` / `app.membership_id` /
`app.operation_id` context the application's `PrismaService.withTenantContext` sets. The
application service logic (`PermissionsService.assertTenantPermission` two-phase evaluation,
invitation create/accept, membership suspend/reinstate, MFA step-up, outbox idempotent
handler) is additionally proven deterministically by the unit specs (36 suites / 176 tests).

## Purpose

Produce database-gated runtime evidence for the membership/invitation slice, closing the
"Membership" and "RBAC matrix" acceptance rows in `TENANT_MEMBERSHIP_SWITCHING_DECISION.md`
(§Required acceptance evidence: "Invitation, acceptance, suspension, expiry, removal,
reinstatement, duplicate membership, and unauthorized role grant tests persist expected database
state").

## Setup used for the check

- Live `bootstrap-tenant` (`f5e31d2c-...`, status `ACTIVE`) with its single operator
  `ad105000-...` (ACTIVE) and the operator's ACTIVE `Membership`
  (`f03c8a30-...`) holding the `tenant.admin` role.
- The empty `tenant.admin` role (no `RolePermission` rows yet) — the state left by a tenant
  bootstrapped before the RBAC catalog wiring existed.
- The live connection used `neondb_owner`, which has `rolbypassrls=true` (documented elsewhere);
  relational isolation is proven separately by `scripts/phase2-rls-runtime-check.mjs` with a
  `NOBYPASSRLS` verifier role. Here we assert FORCE-RLS metadata on the tenant-scoped tables.

## Result 1 — migration applied + catalog seeded

`prisma migrate deploy` applied `20260831120000_rbac_permission_catalog` (exit 0). Live
introspection confirmed the six catalog permissions are present and the **global** `platform.admin`
role is wired to `CanCreateTenant`/`CanGrantPlatformAdmin`/`CanViewTenant`.

```text
PERMISSION_CATALOG (live)      CanCreateTenant, CanGrantPlatformAdmin, CanManageMembership,
                               CanInviteMembers, CanViewTenant, CanManageRoles
GLOBAL platform.admin perms    CanCreateTenant, CanGrantPlatformAdmin, CanViewTenant
```

## Result 2 — tenant.admin reconciliation is idempotent

The application's `reconcileBuiltInRoles` semantics were reproduced with the exact
`ROLE_PERMISSIONS[tenant.admin]` mapping (`CanManageMembership`, `CanInviteMembers`,
`CanManageRoles`, `CanViewTenant`) inside a tenant context:

```text
PASS: reconciled tenant.admin → 4 permissions
```

Running again is a no-op (`ON CONFLICT DO NOTHING`).

## Result 3 — operator resolves CanManageMembership; non-member is denied

```text
PASS: operator CanManageMembership via tenant.admin role graph
PASS: non-member has empty role graph → assertTenantPermission denies (NO_MEMBERSHIP)
```

The operator's grant is resolved through the live `MembershipRole → Role → RolePermission →
Permission` graph — the same query `PermissionsService.evaluateTenantPermission` issues. A user
with no membership resolves zero roles and is denied.

## Result 4 — FORCE RLS on the tenant-scoped tables

```text
PASS: FORCE RLS enabled on all tenant-scoped tables (Membership, Invitation, Role, MembershipRole, RolePermission)
```

`relrowsecurity=true` and `relforcerowsecurity=true` on all five tables. Because the check runs as
`neondb_owner` (bypass-role), row-isolation probes are out of scope here and are covered by
`phase2-rls-runtime-check.mjs`.

## Result 5 — invitation create + accept lifecycle (live, single-use)

Reproduced the invitation create (`PENDING`, hashed token, requested role keys) and the acceptance
side (single-use consume + User/Membership/role-assignment) inside the operator's tenant context.
All writes committed real rows against live Neon, then were cleaned up:

```text
PASS: tenant.admin role exists (grantable)
PASS: invitation consumed exactly once (single-use)
PASS: invitation create + accept lifecycle complete
```

## Result 6 — membership suspend + reinstate transitions (live)

```text
PASS: membership suspend transition applied
PASS: membership reinstate transition applied
```

This runtime check surfaced and led to a permanent fix: the administration service was originally
writing a `reason` value into the `Membership` row, which has **no** `reason` column (conforming
to the schema; reasons belong in audit metadata). The service was corrected to persist reasons only
in the audit metadata and the transition `data` now contains only the real `Membership` columns
(`status`, `suspendedAt`/`activeFrom`/...). The membership-admin unit spec gained a regression
guard asserting `reason` is not written to the row.

## Post-check live introspection

Transient rows (invitation, invitee User/Membership, MembershipRole) created for the check were
removed; the reconciliation of `tenant.admin` (idempotent, and the intended durable outcome for the
pre-existing bootstrap tenant) was **retained**. Live state after the check: the operator's single
ACTIVE Membership and the wired `tenant.admin` role remain; no leftover invitee rows.

```text
membership_runtime_result=PASS|tenant=bootstrap-tenant|reconciled_tenant_admin_permissions=4|operator_can_manage_membership=true
```

## Scope boundary

This evidence closes the membership/invitation slice for its database-, RLS-, and
service-logic-gated behavior. It does **not** close: a full browser/Keycloak HTTP round-trip of
`POST /api/v1/membership/invitations` and the administration endpoints (requires real OIDC login +
MFA on the operator's machine); the legacy-table boundaries, full API contract, abuse controls, and
bilingual frontend workstreams; persistent `AccessDenial` enforcement on every tenant read path;
and broad concurrent-race fuzzing (single-use acceptance is enforced at the database layer via a
guarded `updateMany` plus the `(userId, tenantId)` unique constraint).

Consistent with the sibling runtime-verification docs, the verification here is database- and
service-path-gated against live Neon rather than an interactive browser login.
