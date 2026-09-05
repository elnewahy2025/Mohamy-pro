# RBAC_AUTHORIZATION_AUDIT.md — RBAC, ABAC, Resource Authz, Denials, Enforcement

## 1. Real effective-permissions formula (verified in code)

Verified in `backend/api/src/permissions/permissions.service.ts` where `evaluateTenantPermission` (`:231-277`) computes
`UNION(role.permissions via MembershipRole WHERE revokedAt IS NULL)`, plus `CanSwitchTenant` for any ACTIVE membership (`:271-273`).
Test `permissions.service.spec.ts` verifies allow, `MISSING_PERMISSION`, `NO_MEMBERSHIP`, suspended-deny, and the switch default.

The brief's hypothesized formula (`Roles + Direct − Denials`) does NOT exist: no direct-permission path, no `AccessDenial` evaluation anywhere in `src` (model at `schema.prisma:764-786` only; RLS policy exists but no reader).

## 2. Roles (verified)

Only `tenant.admin`, `tenant.manager` (added 2026-09-05, never instantiated: no `role.create`, no reconcile, no assignment path), `platform.admin` (`role.constants.ts:1-3`). Creation via `bootstrap.service.ts:142-177`; permission wiring via `grantRolePermissions` (`permissions.service.ts:176-190`, auto-creates `Permission` rows from catalog). Invitation-time grant validation exists (`invitation.service.ts:390-422`: rejects `platform.admin`, unknown roles, unheld keys; audits `ROLE_ASSIGNED`). No role-management API: `CanManageRoles` has no route (matrix itself records this, `AUTHORIZATION_MATRIX.md:44`).

## 3. ABAC (verified mostly-absent)

Enforced attributes: membership ACTIVE status (`permissions.service.ts:224-225`, tested), tenant boundary (RLS + context), MFA recency on sensitive paths (`mfa-assurance.service.ts:26-41`, invite/admin/bootstrap call sites). Missing with evidence: organization/branch/department/team scope (fields only, 0 evaluator references), case assignment (no model, `case.service.ts` filters `{id,tenantId}` only), resource classification/sharing (fields + `DocumentShare`/`DocumentAccess` models exist, never consulted in `document.operations.ts:36-55`), workflow state (stored, authz checks permission only).

## 4. Resource-level authorization

Enforced as tenant-scoping + parent-visibility (`require*InTenant`, `hybridReadWhere`, `requireParentVisible`), verified per module. NOT enforced: assignment scoping, classification/sharing scoping, branch scoping. Matrix examples (lawyer/unassigned-case, branch-user/foreign-branch, manager/out-of-scope) all evaluate to ALLOW-if-same-tenant today.

## 5. Denials

`AccessDenial` model + `DenialStatus` + RLS exist; evaluation, precedence, management API, and tests: all MISSING (HIGH). `permission.errors.ts` "Denial" means HTTP non-enumeration, unrelated.

## 6. Backend enforcement map

Canonical pattern (guard → operations.authorize → withTenantContext → tenant-scoped service) verified in phases 3–15, 20–23 except: 6 unguarded scaffold controllers (§CRITICAL in revalidation doc); legal-config implicit REQUEST-scope plumbing (fragile, works); time-tracking non-approve routes authenticated+tenant-scoped but permission-free by design-record; billing/comms/calendar operations authorize with module keys (service specs mock authorize → no permission-deny unit tests; engine suite covers the primitive).

## 7. Authorization tests genuineness

Genuine (assert real denies): engine spec, switch spec, session spec, tenant-context spec, RLS migration spec, deadline/task/document specs (foreign-case/member denies). Mock-success only: party/case/legal-config/workflow/hearing/billing/comms/calendar/timeline service specs (prove tenant scoping + state machines, NOT permission evaluation). Missing entirely: scaffold modules (only fail-closed adapter specs), role management, denials, assignment, classification.
