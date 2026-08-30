# Phase 2 Tenant, Membership, and Switching Decision

**Decision status:** Approved by the project owner as part of the standing Phase 2 preflight approval on 2026-08-22.

**Decision date:** 2026-08-22

**Depends on:** [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md) and [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md)

## Security boundary and hierarchy

The application `Tenant` is the only ordinary data-security boundary. The hierarchy is:

```text
Tenant
└── Organization
    └── Branch
        └── Department
```

`Team` is a flexible assignment construct that belongs to a Tenant and may reference users, departments, branches, and legal resources, but it never becomes an alternate security boundary. Organization, Branch, Department, and Team records carry an unambiguous tenant derivation path; all tenant-owned tables introduced in Phase 2 also carry a direct `tenantId` where practical for database enforcement and query performance.

| Boundary | Purpose | Security rule |
|---|---|---|
| Tenant | Law firm, legal office, organization, or SaaS customer | The primary tenant-isolation boundary. |
| Organization | Operating grouping within a tenant | Cannot grant access outside its parent Tenant. |
| Branch | Location grouping within an organization | Cannot cross parent Organization or Tenant. |
| Department | Team/functional grouping within a branch | Cannot cross parent Branch or Tenant. |
| Team | Flexible assignment of staff/resources | Cannot create an alternate access boundary. |

Tenant lifecycle states are `PENDING`, `ACTIVE`, `SUSPENDED`, and `ARCHIVED`. Only `ACTIVE` tenants may establish ordinary tenant context. A suspended or archived tenant denies all ordinary tenant operations, including login completion into that tenant, while preserving records required for audit, legal retention, and controlled recovery.

## Identity and membership model

A global application `User` is distinct from tenant `Membership`:

- `User` represents the application identity mapped from one or more approved external identities.
- `ExternalIdentity` uniquely maps `(provider, subject)` to one User; email matching never silently links identities.
- `Membership` binds one User to one Tenant and carries lifecycle, invitation, active-window, and administrative state.
- Tenant roles and scope assignments are attached to the Membership or to explicit tenant-scoped assignment records.
- Platform Admin is a separate global assignment and is not obtained through an ordinary tenant membership.

Membership lifecycle states are `INVITED`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, and `REMOVED`:

| State | Tenant context | Membership administration |
|---|---|---|
| `INVITED` | Denied | May be accepted only through the validated invitation flow. |
| `ACTIVE` | Allowed if User and Tenant are active and active dates permit | May use assigned roles/scopes. |
| `SUSPENDED` | Denied | May be reinstated only by an authorized administrator with audit evidence. |
| `EXPIRED` | Denied | Requires a new approved membership window or invitation. |
| `REMOVED` | Denied permanently for that membership record | Historical record is retained; a new membership follows the controlled invitation/authorization path. |

There is at most one current Membership record for a `(userId, tenantId)` pair. Reinstatement updates the lifecycle state with audit history rather than creating duplicate active memberships. A user may have active memberships in multiple tenants, but may have only one active tenant context per application session.

## Tenant bootstrap

Tenant bootstrap is not public self-service in Phase 2. The first Platform Admin identity is provisioned out-of-band in Keycloak and linked to the application through a one-time, operator-controlled bootstrap procedure. The bootstrap procedure:

1. Requires a protected, environment-only bootstrap subject identifier or equivalent approved external identity reference and a one-time bootstrap secret.
2. Validates the authenticated OIDC subject, recent MFA, and exact bootstrap configuration.
3. Creates the initial global Platform Admin assignment and the first Tenant/Organization hierarchy in one transaction, or refuses to run if a Platform Admin already exists.
4. Invalidates the bootstrap secret and records an append-only audit event before returning success.
5. Cannot be invoked through an unauthenticated endpoint, cannot be repeated successfully, and cannot assign Platform Admin through a Tenant Admin request.

After bootstrap, only an existing Platform Admin with recent MFA may create a Tenant or grant/revoke global Platform Admin assignment. Tenant Admin may manage users and memberships within the current Tenant but cannot create a Tenant, change tenant ownership, grant Platform Admin, or access another Tenant.

The bootstrap procedure must be implemented as a controlled operator command or one-time protected deployment action, not as a hidden production bypass. Its configuration, use, invalidation, and removal must be documented and tested. No bootstrap secret, subject value, or provider credential may be committed or printed.

### Implementation (backend)

The Phase 2 implementation provides `POST /api/v1/bootstrap`, protected by `SessionGuard` + `CsrfGuard`, in `backend/api/src/bootstrap`. Configuration is environment-only (`BOOTSTRAP_SUBJECT`, `BOOTSTRAP_SECRET`, `BOOTSTRAP_TENANT_SLUG`, `BOOTSTRAP_TENANT_NAME`, `BOOTSTRAP_ORG_SLUG`, `BOOTSTRAP_ORG_NAME`, `BOOTSTRAP_MFA_MAX_AGE_SECONDS`); the request body carries only the one-time secret. The operator must set these on the deployment that performs bootstrap and remove them once bootstrap succeeds.

The service performs a fail-closed single transaction (`withTenantContext`) that, on success, creates the `Tenant`, `Organization`, `Membership`, the global `platform.admin` Role + `GlobalRoleAssignment`, the tenant `tenant.admin` Role + `MembershipRole`, the `PlatformBootstrap` marker, an append-only `tenant.bootstrap.succeeded` audit event, and a `tenant.bootstrap.succeeded` outbox message. The subject and secret are compared in constant time, MFA must be verified within the configured maximum age, and the configured subject must match the authenticated OIDC subject.

Invalidation: the one-time secret is never stored in plaintext; only its SHA-256 hash is persisted on the `PlatformBootstrap` marker. The marker is a singleton enforced at the database level (`UNIQUE` + `CHECK (singleton = true)`), so bootstrap is non-repeatable per environment: any subsequent invocation is refused (`ALREADY_BOOTSTRAPPED`) and recorded as a `tenant.bootstrap.denied` audit event, regardless of the presented secret. Because the marker is a global (non-RLS) row readable before any tenant context exists, it also guarantees no second tenant can ever bootstrap even if another deployment races a bootstrap. This was verified against a live Neon database: first bootstrap succeeds, repeat and wrong-subject invocations fail closed.

## Invitations and membership administration

A membership invitation is a tenant-owned record with an opaque hashed token, intended normalized verified email, target role set, optional organization/branch/department/team scope, inviter, expiration, status, and audit linkage. Invitation status is `PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`, or `REJECTED`.

The inviter must have `CanManageMembership` in the target Tenant. The invitation cannot grant a role or scope that the inviter is not allowed to grant. Tenant Admin cannot grant Platform Admin. A user accepts only after authenticating through Keycloak and matching the verified invitation identity. Acceptance creates or links the User and activates the Membership only after all lifecycle, tenant, role, and invitation checks pass in one transaction.

Invitations are single-use. Replays, wrong-identity acceptance, expired invitations, revoked invitations, suspended tenants, and unauthorized inviter actions return controlled errors without leaking whether another account or tenant exists.

## Deterministic tenant context

The active tenant is derived from the server-side application session and a database membership lookup. Ordinary tenant-scoped endpoints do not accept a browser-controlled `tenantId` header, cookie, or body field as authority. The server rejects such fields on ordinary tenant-scoped requests rather than silently trusting or ignoring them.

The only exception is the dedicated membership-switch operation:

```text
POST /api/v1/session/tenant-switch
```

This operation accepts a target tenant identifier only as a selector. It must:

1. Authenticate the session and validate CSRF and `Idempotency-Key` requirements.
2. Load the target Membership by `(session.userId, targetTenantId)` using a transaction and row-level authorization.
3. Require `Membership=ACTIVE`, `User=ACTIVE`, `Tenant=ACTIVE`, and valid active dates.
4. Verify that no explicit denial, suspension, or session restriction blocks the switch.
5. Atomically update the server-side session’s active tenant context and increment a context version.
6. Emit an append-only tenant-switch audit event containing actor, session-safe identifier, source tenant when available, target tenant, correlation ID, reason/result, and trace metadata without raw tokens.
7. Return the server-derived tenant context and allowed navigation metadata; it must not return unrestricted permission claims as a substitute for backend policy checks.

A missing active tenant context returns a controlled `TENANT_CONTEXT_REQUIRED` result for ordinary tenant-scoped operations. A target tenant that is unknown, inactive, not a current membership, or denied produces the same non-enumerating failure class. Switching does not change the user’s roles or memberships.

Platform Admin operations are separately named global policies and routes. A Platform Admin may perform a cross-tenant operation only when the policy explicitly permits it, recent MFA is present, the target tenant is loaded by a server-side selector, and the operation is audited. A Platform Admin does not gain silent ordinary access to all tenant data through a normal tenant context.

## Authorization consequences

The Phase 0 authorization matrix is applied as follows:

| Role | Tenant behavior |
|---|---|
| Platform Admin | Global operations only through explicit MFA-protected policies; tenant acting context is explicit and audited. |
| Tenant Admin | Current Tenant administration; cannot grant Platform Admin or cross the tenant boundary. |
| Managing Partner | Tenant-wide case/financial scope subject to named policy and audit requirements. |
| Lawyer | Assigned-case scope only; unassigned resource access is denied. |
| Paralegal/Staff | Assigned-case scope with defined read/create limits; no final approval or permanent deletion. |
| Client | Own-case/shared-document scope only; no staff or tenant-administration access. |

The backend and database enforce these policies. Frontend tenant selectors and navigation are presentation only and cannot establish or widen authority.

## Integrity and database requirements

The schema and migrations must enforce:

- Foreign keys from every hierarchy/member/assignment record to its parent.
- Tenant-consistent foreign-key relationships; a child cannot reference a parent from another Tenant.
- Unique normalized tenant slug and external identifiers.
- Unique `(userId, tenantId)` current membership relation with historical state preserved.
- Unique external identity `(provider, subject)` and no silent email-based identity linking.
- Valid lifecycle and date checks, including `activeFrom < activeUntil` when both exist.
- Indexes for `(tenantId, state)`, membership lookups, active context, invitation expiry/status, and authorization scope queries.
- Explicit soft-delete/archive behavior with no destructive cascade for legal/audit records.
- An RLS or compensating-control decision for every tenant-owned table before migration acceptance.

## Required acceptance evidence

| Requirement | Required proof |
|---|---|
| Bootstrap | First bootstrap succeeds once with real provider identity and MFA; repeat, wrong subject, missing secret, and unauthorized invocation fail closed. |
| Membership | Invitation, acceptance, suspension, expiry, removal, reinstatement, duplicate membership, and unauthorized role grant tests persist expected database state. |
| Tenant isolation | Tenant A cannot read, list, search, queue, cache, export, download, or modify Tenant B resources through IDs, filters, routes, or background jobs. |
| Switching | Valid active-membership switch succeeds and audits; unknown, inactive, suspended, expired, removed, and cross-user targets fail with non-enumerating errors. |
| Platform Admin | Global policy requires MFA; Tenant Admin cannot grant or become Platform Admin; cross-tenant actions are named and audited. |
| Hierarchy | Organization/Branch/Department/Team parent mismatch and cross-tenant reassignment are rejected by database and service tests. |
| Concurrent behavior | Concurrent switch, invitation acceptance, membership suspension, and role changes produce one valid committed outcome without duplicate active state. |
| Frontend | English and Arabic tenant selection and no-membership states render correctly with LTR/RTL behavior, but backend denial remains authoritative. |

## References

1. [`Phase 0 multi-tenancy`](../phase0/MULTI_TENANCY.md)
2. [`Phase 0 authorization`](../phase0/AUTHORIZATION.md)
3. [`Phase 0 authorization matrix`](../phase0/AUTHORIZATION_MATRIX.md)
4. [`Phase 0 domain model`](../phase0/DOMAIN_MODEL.md)
5. [`Phase 0 threat model`](../phase0/THREAT_MODEL.md)
6. [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md)
7. [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md)
8. [`Phase 2 plan audit`](PHASE2_PLAN_AUDIT.md)
9. [`Phase 2 implementation plan`](PHASE2_IMPLEMENTATION_PLAN.md)
