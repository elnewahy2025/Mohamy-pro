# Authorization and MFA Assurance Implementation Plan

**Workstream:** Phase 2 — roles, permissions, named policies, explicit denials, and provider MFA assurance.

**Status:** Bounded policy/RLS/API implementation and Windows runtime slice accepted; full authorization/MFA workstream remains open. Phase 2 remains open.

## Governing requirements

The implementation follows the frozen authorization model in [`AUTHORIZATION.md`](../phase0/AUTHORIZATION.md), the role/resource/action/scope matrix in [`AUTHORIZATION_MATRIX.md`](../phase0/AUTHORIZATION_MATRIX.md), and the Phase 2 requirements in [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md). The application backend is authoritative. Frontend permission data can shape presentation only and cannot establish access.

The authentication boundary follows [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md) and [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md): Keycloak owns credentials and MFA enrollment/challenge; Mohamy Pro validates the provider assurance claims and recent authentication time for staff-sensitive operations.

## Policy contract

The policy engine exposes named policies rather than raw role checks in controllers. The first implementation registers these names:

| Policy                        | Purpose                                                                      | Required context                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `CanViewTenant`               | Read a tenant-scoped resource or tenant context                              | Authenticated user, active membership, target tenant                                   |
| `CanManageMembership`         | Create, update, remove, or otherwise administer tenant memberships           | Authenticated user, active tenant membership, target tenant, recent MFA                |
| `CanSwitchTenant`             | Select a different tenant through the dedicated server-validated switch flow | Authenticated user, target tenant membership, active target membership                 |
| `CanReadOrganizationSettings` | Read tenant organization settings                                            | Authenticated user, active tenant membership, target tenant                            |
| `CanManageRole`               | Create, update, assign, or revoke tenant roles                               | Authenticated user, tenant membership, target tenant, recent MFA                       |
| `CanManagePermission`         | Change permission assignments in the approved administration surface         | Authenticated user, tenant membership or global administrator context, recent MFA      |
| `CanManageDenial`             | Create, revoke, or update explicit tenant denials                            | Authenticated user, tenant membership, target tenant, recent MFA                       |
| `CanAccessResource`           | Evaluate resource-level and assignment attributes for legal-domain callers   | Authenticated user, active membership, resource attributes, target tenant              |
| `CanPerformPlatformOperation` | Perform a global or cross-tenant operation                                   | Authenticated user, active application session, global Platform Admin role, recent MFA |

The registry is closed: unknown policy names fail closed as an internal programming error and are not interpreted as permission grants.

## Permission catalog

Permission keys are normalized and stable. They are derived from the frozen matrix and do not encode user IDs, tenant IDs, resource IDs, or other unbounded values:

| Key family                                              | Meaning                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| `tenant.read`                                           | Read an authorized tenant context or tenant-owned resource   |
| `tenant.manage`                                         | Manage tenant-level administrative settings                  |
| `organization_settings.read`                            | Read organization settings                                   |
| `membership.manage`                                     | Manage tenant memberships                                    |
| `role.manage`                                           | Manage role definitions and assignments                      |
| `permission.manage`                                     | Manage permission assignments                                |
| `denial.manage`                                         | Manage explicit denials                                      |
| `case.read` / `case.update`                             | Read or update cases subject to assignment and scope         |
| `financial.read` / `financial.approve`                  | Read or approve tenant financial records                     |
| `document.create` / `document.read` / `document.update` | Create, read, or update documents subject to case assignment |
| `invoice.read` / `invoice.pay`                          | Read or pay invoices for an authorized client case           |
| `tenant.platform_manage`                                | Global Platform Admin tenant operations                      |
| `tenant.switch`                                         | Dedicated tenant switching                                   |

A global Platform Admin role is represented by a global `Role` with key `platform_admin` and an active `GlobalRoleAssignment`. Tenant roles use the frozen keys `tenant_admin`, `managing_partner`, `lawyer`, `paralegal`, and `client`. Role keys are catalog identifiers, not browser-provided authorities.

## Decision evaluation order

Every authorization decision executes in this order:

1. The request must have an authenticated application session and an allowed `User` state.
2. A target tenant is required for every tenant-scoped policy. A non-Platform-Admin caller is denied when it differs from the session’s active tenant.
3. A target membership must be active and time-valid, and its tenant must be active, unless the policy is explicitly global.
4. Active role assignments and role permissions are loaded through the existing RLS transaction context. Revoked assignments do not grant permissions.
5. Active explicit denials are evaluated before role grants. A denial matches the permission and, when supplied, the resource type/resource ID; subject-specific denials match the current user, while tenant-wide denials match every subject in that tenant. Future-dated denials are inactive; expired or revoked denials do not apply.
6. Resource and assignment attributes are evaluated. An assigned-case policy requires the current membership to be explicitly assigned; a client policy requires the current user to be the resource’s primary client; shared-client document access requires the resource’s explicit client-sharing flag.
7. Global or staff-sensitive policies require a recent provider MFA assurance. The API checks a stored session MFA timestamp, the configured required assurance method, and the configured maximum authentication age. Frontend flags and stale session claims never satisfy this step.
8. The result is either an allow decision with the named policy and permission or a controlled deny reason. The caller never receives role inventory, denial inventory, or cross-tenant existence details through the error response.

## MFA assurance contract

The session object carries only the already-persisted assurance metadata needed by backend policy evaluation: `mfaVerifiedAt`, `mfaAcr`, and the allowlisted `mfaAmr` values. These values are never serialized into the public session DTO.

The API configuration adds:

| Setting               | Development/test profile                  | Production-capable profile                                            |
| --------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| `MFA_REQUIRED_AMR`    | Defaults to `mfa` when omitted            | Must be explicitly provided and non-empty                             |
| `MFA_REQUIRED_ACR`    | Optional additional exact assurance value | May be required when the provider profile defines one                 |
| `MFA_MAX_AGE_SECONDS` | Defaults to 900 seconds                   | Must be explicitly provided, bounded, and no greater than 900 seconds |

The default acceptance profile therefore requires an `amr` value of `mfa` and authentication no older than fifteen minutes. When `MFA_REQUIRED_ACR` is configured, the session `acr` must equal it exactly. Missing, malformed, stale, or insufficient assurance returns a controlled `MFA_STEP_UP_REQUIRED` denial without resource details.

## Database boundary

The existing RLS migration protects tenant roles, membership-role assignments, role-permission rows, and explicit denials. The implementation adds an additive RLS policy for `GlobalRoleAssignment` so the runtime role can read only the authenticated user’s own active global assignments through a request transaction context. A second additive migration grants the restricted runtime role read-only access to the authorization tables needed to evaluate those policies; it does not grant write, ownership, migration, or role-management privileges. No applied migration is edited, no default-allow policy is introduced, and no runtime connection is granted migration privileges.

Authorization reads use `withMembershipSelectionContext` for the authenticated user’s global assignments and `withTenantContext` for tenant assignments and denials after server-side membership validation. A policy evaluator may consume a transaction-local snapshot, but it must not perform unscoped reads through the runtime Prisma client.

## Application integration

The policy service is registered in a dedicated authorization module. A reusable policy decorator/guard is provided for protected controllers, while the existing tenant-switch service calls the named `CanSwitchTenant` policy before session compare-and-set mutation. The current-access route uses `CanViewTenant` and returns an allowlisted server projection. Existing membership validation remains authoritative for target membership eligibility; the policy layer must not remove or duplicate the transaction ordering that prevents rejected switches from changing session context. Real Windows evidence for this bounded slice is recorded in [`AUTHORIZATION_MFA_RUNTIME_EVIDENCE.md`](AUTHORIZATION_MFA_RUNTIME_EVIDENCE.md).

The MFA guard is reusable for administrative controllers and is also invoked by the policy service for Platform Admin and staff-sensitive policies. No new public self-registration or invitation behavior is introduced in this workstream; invitation endpoints remain the next workstream and will consume `CanManageMembership` after this policy boundary is verified.

## Verification requirements

The workstream is not accepted on unit tests alone. It requires:

| Layer           | Required evidence                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure evaluator  | Positive and negative cases for every frozen role, assigned/unassigned resource boundaries, client ownership, shared documents, explicit denials, tenant escape, permanent deletion, Platform Admin restrictions, and unknown policies |
| Session/MFA     | Claim persistence/propagation, missing MFA, wrong `amr`, wrong `acr`, stale timestamp, and recent valid MFA cases                                                                                                                      |
| Database        | Both additive migrations apply to existing and fresh databases; global assignments are hidden from unrelated users and unscoped runtime reads                                                                                          |
| API             | Protected route or service path uses the policy layer, controlled denial envelopes, and correlation/audit behavior                                                                                                                     |
| Runtime         | Real Windows PostgreSQL/API flow proves policy decisions using the restricted runtime role; no frontend-only or mock authorization claim is accepted                                                                                   |
| Static/security | Build, tests, Prisma validation/generation, formatting, syntax, security scan, and final diff review pass for affected files                                                                                                           |

The bounded policy/RLS/API slice is accepted by the evidence in [`AUTHORIZATION_MFA_RUNTIME_EVIDENCE.md`](AUTHORIZATION_MFA_RUNTIME_EVIDENCE.md). Full authorization/MFA workstream acceptance still requires a real protected administrative operation with provider MFA/step-up evidence and complete negative cases. Acceptance of the full workstream does not close invitation/onboarding, generated-client, frontend, abuse/lifecycle, hosted CI, or supported production deployment gates.

## References

1. [`AUTHORIZATION.md`](../phase0/AUTHORIZATION.md)
2. [`AUTHORIZATION_MATRIX.md`](../phase0/AUTHORIZATION_MATRIX.md)
3. [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md)
4. [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md)
5. [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md)
6. [`RLS_TENANT_ENFORCEMENT_DECISION.md`](RLS_TENANT_ENFORCEMENT_DECISION.md)
7. [`ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md`](ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md)
