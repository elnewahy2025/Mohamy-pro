# Phase 2 Membership, Invitation & RBAC Implementation

**Date:** 2026-08-31

**Scope:** The membership/invitation slice of Phase 2, including the application-backed RBAC
engine (Option B), the MFA assurance gate, invitation create/accept, and membership
administration (suspend/expire/remove/reinstate). This closes the "Membership" and a large share
of the "RBAC matrix" acceptance rows in `TENANT_MEMBERSHIP_SWITCHING_DECISION.md` (frozen
2026-08-22), per the "Option B" decision (Steps 1→2→3) confirmed by the operator.

## Architecture

The slice is implemented as three focused, single-responsibility modules:

1. **RBAC engine** (`src/permissions/`)
   - `permission.constants.ts` — the global permission catalog (`CanCreateTenant`,
     `CanGrantPlatformAdmin`, `CanManageMembership`, `CanInviteMembers`, `CanViewTenant`,
     `CanManageRoles`) and the built-in `ROLE_PERMISSIONS` mapping (tenant.admin /
     platform.admin → permission keys), in one auditable location.
   - `role.constants.ts` — stable role keys (`tenant.admin`, `platform.admin`).
   - `permission.errors.ts` — `PermissionDeniedError` (non-enumerating `403 FORBIDDEN`).
   - `permissions.service.ts` — `assertTenantPermission` performs a two-phase evaluation:
     the actor's membership is resolved under the read-only **membership-selection** boundary
     (`withMembershipSelectionContext`), then the actor's role→permission graph is evaluated
     under the **tenant-context** boundary (`withTenantContext`). Denial is identical regardless
     of reason (`NO_MEMBERSHIP` / `MEMBERSHIP_NOT_ACTIVE` / `MISSING_PERMISSION`). Also provides
     `hasGlobalPermission`, `grantRolePermissions` (idempotent upsert inside the caller's
     transaction — satisfies the `RolePermission` FORCE-RLS policy), and
     `reconcileBuiltInRoles` (idempotent backfill so tenants bootstrapped before the catalog
     wiring gain the standard permissions).
   - `permissions.module.ts` — `@Global()`, registered in `app.module.ts`.

2. **MFA assurance gate** (`src/auth/mfa/`)
   - `mfa.errors.ts` — `MfaStepUpRequiredError` (`401 UNAUTHORIZED`).
   - `mfa-assurance.service.ts` — `assertRecentMfa(sessionId)` reads `AppSession.mfaVerifiedAt`
     and requires it to be within `SENSITIVE_ACTION_MFA_MAX_AGE_SECONDS` (default 900s, added to
     `env.validation.ts`). A dedicated parameter so sensitive actions are not tied to the
     bootstrap-only MFA age. Exposed from `auth.module.ts`.

3. **Membership slice** (`src/membership/`)
   - `invitation/` — `create` (recent MFA + `CanManageMembership`, role-grantability check:
     the requested keys must exist in the tenant and be grantable by the inviter; the token is
     stored only hashed, the raw token returned once) and `accept` (finds the invitation by
     `tokenHash`, validates lifecycle/tenant state and identity binding, then atomically links
     `User`/`ExternalIdentity`, creates the `ACTIVE` `Membership` with a pre-generated id, and
     assigns the requested roles inside one `withTenantContext` transaction; single-use via a
     guarded `updateMany where status=PENDING`). `InvitationOutboxHandler` idempotently confirms
     the `membership.invitation.created` outbox message; registered in `OutboxHandlerRegistrar`
     + `OutboxModule`.
   - `admin/` — `suspend`/`expire`/`remove`/`reinstate`, each a guarded lifecycle transition
     (recent MFA + `CanManageMembership`, allowed-from status set, non-enumerating
     `MembershipAdminDeniedError`, audit event). Reasons are persisted in audit metadata only
     (the `Membership` row has no `reason` column).
   - `membership.module.ts` — imports `AuthModule`; providers invite + admin services;
     registered in `app.module.ts`.

The `bootstrap.service.ts` now grants `ROLE_PERMISSIONS` to newly created global/tenant roles via
`PermissionsService.grantRolePermissions`, keeping bootstrap and reconciliation consistent.

## Migration

`prisma/migrations/20260831120000_rbac_permission_catalog/migration.sql` — additive, idempotent:

- Seeds the six-catalog `Permission` rows (`ON CONFLICT (key) DO NOTHING`). `Permission` is
  global and RLS-free, so this is safe in the migration transaction.
- Wires the **global** `platform.admin` role to its global policies via `RolePermission`
  (`ON CONFLICT DO NOTHING`). `RolePermission` carries FORCE RLS; its policy permits global-role
  rows without tenant context, so this backfill is safe here. Tenant-scoped `tenant.admin` roles
  are wired by the application reconciliation service inside the correct per-tenant context (the
  FORCE-RLS policy requires a tenant context for tenant rows).

## Verification status

- `nest build` → **exit 0**.
- Full `jest --runInBand` → **36 suites / 176 tests** (baseline 154), exit 0.
- `prisma migrate status` → only `20260831120000_rbac_permission_catalog` pending **before**
  deploy; `prisma migrate deploy` → **exit 0** ("All migrations have been successfully applied").
- Runtime verification against live Neon: see
  [`HOSTED_MEMBERSHIP_INVITATION_RUNTIME_VERIFICATION.md`](HOSTED_MEMBERSHIP_INVITATION_RUNTIME_VERIFICATION.md).

## Runtime evidence (live Neon)

Fully detailed in the sibling runtime doc. In summary: `tenant.admin` for `bootstrap-tenant` was
reconciled to its four standard permissions idempotently; the operator resolves `CanManageMembership`
through the live role graph; a non-member resolves an empty role graph (denial); the five
tenant-scoped tables are FORCE RLS; and the invitation create/accept + suspend/reinstate lifecycle
committed real rows against live Neon, then were cleaned up.

## Scope boundary

This slice closes the membership/invitation workstream and the RBAC engine for its
database/service/RLS-gated behavior. It does **not** close: a full browser/Keycloak HTTP
round-trip of the new endpoints (requires a real OIDC login + MFA on the operator's machine); the
legacy-table boundary workstream; the full API-contract and frontend workstreams; persistent
`AccessDenial` enforcement on read paths (the disallowed-scope evaluation) and the complete
named-policy matrix across every tenant resource (beyond the membership/invitation permissons
implemented here); and concurrent-acceptance race fuzzing (the single-use gate is enforced at the
database layer via a guarded `updateMany`; a rolled-out duplicate is rejected by the
`(userId, tenantId)` unique constraint).
