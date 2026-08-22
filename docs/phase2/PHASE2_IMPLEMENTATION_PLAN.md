# Phase 2 Implementation Plan — Identity and Multi-Tenancy

**Plan status:** Authorized to begin under the qualified Windows-Docker boundary

**Entry decision:** [`PHASE2_ENTRY_DECISION.md`](PHASE2_ENTRY_DECISION.md)

**Governing production wording:** Phase 1 implementation and Windows runtime gates closed; deployment production boundary open.

## Objective

Phase 2 will introduce the authenticated identity, membership, tenant, organization, branch, department, team, role, permission, denial, session, and tenant-context foundations required before tenant-scoped legal domains are built. The backend and database are authoritative. The frontend may present permissions, but it must not become the security boundary.

The current Prisma schema contains Phase 1 foundation tables—`Health`, `StorageObject`, `OutboxMessage`, and `IdempotencyKey`—and does not yet contain the Phase 2 identity or tenant entities. Phase 2 therefore begins with additive schema design and migrations rather than retrofitting tenant behavior into an existing business-domain model.

## Frozen Phase 0 decisions

The implementation must preserve these decisions:

| Decision | Phase 2 requirement |
|---|---|
| Tenant boundary | `Tenant` is the security boundary. Tenant context is derived from authenticated membership, never trusted from browser input. |
| Operating hierarchy | `Tenant` → `Organization` → `Branch` → `Department`; `Team` is a flexible assignment construct. |
| Identity | `User` and `Membership` are distinct; membership connects a user to a tenant and carries status and role assignments. |
| Authorization | Use RBAC, ABAC, resource-level authorization, branch/department restrictions, and explicit denials through named policies. |
| Authentication | Use the frozen OAuth 2.1/OIDC direction with Keycloak for self-hosted enterprise deployment; access tokens are short-lived, refresh tokens rotate, and MFA is required for staff-sensitive flows. |
| Database | PostgreSQL remains the source of truth. Use foreign keys, unique/check constraints, indexes, migrations, and PostgreSQL RLS where appropriate. |
| API | Preserve `/api/v1`, standard success/error envelopes, OpenAPI, generated-client re-entry, and API contract tests. |
| Frontend | Use Next.js App Router, TanStack Query, Zod, React Hook Form, and full English/Arabic LTR/RTL support without duplicating authorization rules. |
| Audit | Auth, membership, permission, denial, tenant-switch, and sensitive-access events must be designed as append-only audit events for the Phase 2/3 foundation. |
| Outbox | Identity and membership events use the existing transactional outbox and dedicated worker; handlers must be idempotent and fail closed. |

## Audit hold — mandatory decisions before coding

The first plan audit identified P1 ambiguities that must be resolved in an accepted architecture decision before Phase 2 application code begins. Option B authorizes Phase 2 entry, but it does not authorize implementation on top of unresolved authentication, tenant-boundary, API-contract, idempotency, RLS, or audit assumptions.

| Decision gate | Required resolution before coding |
|---|---|
| OIDC provider and runtime | Select the self-hosted Keycloak topology for Windows-Docker development and verification, or record an explicitly approved alternative. Define issuer, audience, client type, redirect URLs, PKCE/state/nonce, JWKS caching, clock skew, logout/revocation, secret ownership, and a real provider integration test. |
| Token transport and browser session | Select bearer-only or cookie-backed transport. Do not leave both possible. If cookies are selected, enable credentials only for approved origins and implement CSRF/origin protection for state-changing endpoints; if bearer-only is selected, define refresh-token non-exposure, storage, revocation, and XSS controls. |
| Account lifecycle ownership | Record whether Keycloak owns credentials, password management, email verification, invitations, recovery, and MFA. Define disabled-user, suspended-membership, zero-membership, and session-revocation behavior. |
| Tenant switching and bootstrap | Reject client tenant identity as authority. Only a dedicated switch operation may accept a target tenant selector, after active-membership verification; audit the switch. Define first-tenant/first-admin, invitations, membership approval, zero-membership, and multi-membership behavior. |
| API contract migration | Implement the frozen success/error envelopes before accepting Phase 2 endpoints. Align the exception filter, validation errors, OpenAPI schemas, Phase 1 compatibility decision, and contract tests. |
| HTTP idempotency | Make idempotency mandatory before the first mutation. Define request fingerprint, method/path/actor/tenant binding, replay and conflict behavior, expiry, concurrent reservation, failure behavior, cleanup, and database constraints. |
| RLS and compensating controls | Produce a table-by-table RLS decision, transaction-local context mechanism, connection-pool reset rule, privileged-access boundary, and compensating repository/service controls for every table not protected by RLS. |
| Phase 2 audit store | Implement the minimum append-only audit event persistence for authentication, membership, roles/permissions, denials, tenant switching, and privileged access; define redaction, retention ownership, immutability, indexing, authorization, and outbox linkage. |
| Abuse and identity-data lifecycle | Freeze IP/identifier throttling, lockout or step-up behavior, enumeration-safe responses, identity retention, residency, minimization, export, deletion/archival, and cascade rules. |
| Generated client and real integration topology | Make generated API-client generation/consumption and real OIDC integration tests mandatory Phase 2 gates; isolated unit doubles may test pure token logic only and must never be production-wired. |

The preflight decisions are recorded and owner-approved, and the corrected plan re-audit is published. The plan is therefore authorized for Phase 2 application implementation under Option B. This authorization does not imply that any implementation, test, or runtime evidence already exists.

## Workstreams and exit gates

### 1. Identity schema and migration

Design and add the normalized identity schema through an additive Prisma migration. The design must include `User`, `ExternalIdentity` or the approved OIDC subject mapping, `Session` or the approved session reference, and user lifecycle fields. Email uniqueness, normalized identity fields, disabled/deleted states, timestamps, and actor references must be explicit. Secrets such as password hashes or provider credentials must not be stored unless the authentication architecture explicitly requires local credential storage.

The migration must be deployable on the existing Windows PostgreSQL verification database without reset or manual migration-table edits. It must pass fresh-database deployment, migration-checker validation, Prisma generation, schema checks, and rollback/mitigation review. The migration must not modify or reinterpret the accepted legacy migration history. Every identity and tenant table must have an explicit RLS or compensating-control decision before the migration is accepted.

### 2. Tenant hierarchy and membership

Add `Tenant`, `Organization`, `Branch`, `Department`, `Team`, and `Membership` with explicit foreign keys and lifecycle states. Membership must bind a `User` to a `Tenant` and carry membership status, active dates where required, and the relationship used to derive request tenant context. Organization, branch, department, and team membership must not create alternate security boundaries that bypass the tenant.

Define uniqueness and integrity rules for tenant slugs or external identifiers, hierarchy ownership, active membership, and membership switching. Every tenant-scoped table introduced in Phase 2 must contain a tenant key or have an unambiguous tenant derivation path, with indexes designed for the expected authorization and list queries.

### 3. Roles, permissions, policies, and denials

Implement normalized role and permission definitions with tenant-scoped assignments and explicit denial records. The policy engine must expose named policies such as `CanViewTenant`, `CanManageMembership`, `CanSwitchTenant`, and `CanReadOrganizationSettings`, rather than spreading raw role checks through controllers.

Authorization decisions must consider authenticated user, membership, tenant, role, permission, assignment, organization/branch/department scope, resource ownership, resource attributes, and explicit denials. Platform Admin is the only cross-tenant role in the frozen matrix and requires MFA. Tenant Admin must not elevate a user to Platform Admin. Standard users must not permanently delete legal records or access unassigned resources.

### 4. Authentication and session boundary

Integrate the approved OIDC provider boundary through an adapter/interface. Validate issuer, audience, signature, expiry, nonce/state where applicable, and the subject-to-user mapping before establishing authenticated context. Do not implement a provider-specific dependency inside the domain layer.

Implement login, logout, session revocation, membership switching, and the authentication error boundary. Short-lived access tokens, rotating refresh tokens, MFA requirements for staff-sensitive paths, and device/session tracking must be represented in the design and verified in integration tests. The implementation must not log access tokens, refresh tokens, password material, or sensitive identity payloads.

### 5. Tenant context and enforcement

Create a single backend tenant-context mechanism that runs after authentication and before business data access. Ordinary tenant-scoped endpoints must reject client-supplied tenant identity as an authority. Only the dedicated membership-switch operation may accept a target tenant selector; it must verify active membership server-side, establish the approved active context, and emit an audit event. A client value must never establish trust.

Apply the context consistently to repositories, services, transactions, queues, caches, object-storage metadata, exports, and integrations. Use PostgreSQL RLS where appropriate, with tests proving that application-level mistakes cannot silently create cross-tenant access. Any privileged cross-tenant operation must be a separately named policy, MFA-protected where required, and audited.

The first implementation slice is recorded in [`RLS_TENANT_CONTEXT_IMPLEMENTATION.md`](RLS_TENANT_CONTEXT_IMPLEMENTATION.md). It adds the transaction-local Prisma helper, pre-membership scope clearing, and a fail-closed RLS migration for the Phase 2 hierarchy, membership, invitation, tenant-role, role-assignment, and denial tables. The slice has passed static validation and unit tests, but its Windows PostgreSQL runtime gate remains open. `StorageObject`, `OutboxMessage`, and `IdempotencyKey` remain deliberately outside this staged migration until their callers are tenant-aware; no permissive `tenantId IS NULL` policy is allowed.

### 6. API and frontend contracts

Define Phase 2 REST endpoints under `/api/v1` for identity, membership, tenant selection, and administration. Every endpoint must have OpenAPI documentation, standard success/error envelopes, correlation IDs, validation schemas, authorization policies, and contract tests. The frozen `Idempotency-Key` contract, including replay/conflict/concurrency behavior, must be implemented before the first state-changing endpoint is accepted.

The frontend must consume the approved API contract through the generated-client re-entry gate when the Phase 2 surface is stable. English and Arabic message catalogs, locale-aware formatting, `dir="ltr"`/`dir="rtl"`, accessible form errors, and keyboard navigation are mandatory. The frontend must not make authorization decisions that are absent from the backend response.

### 7. Events, audit, and observability

Define identity and membership domain events with explicit event types, versioned payloads, aggregate identifiers, tenant context, correlation ID, and traceparent metadata. Persist the event in the existing transactional outbox when the state change and event publication require atomicity. Verify retries, duplicate delivery, dead-letter behavior, and handler idempotency with real PostgreSQL and Redis.

Define and persist append-only audit events for login, logout, session revocation, membership creation/change/removal, role and permission changes, denial decisions, tenant switching, and privileged access. Redact secrets and avoid storing raw tokens or unnecessary personal payloads. Define authorization, retention ownership, immutability, indexing, and outbox linkage. Add bounded metrics and traces without exceeding the documented observability boundary. The first Phase 2 mutation endpoint must provide the API-originated API-to-outbox-to-worker trace continuity re-entry evidence.

### 8. Security and abuse controls

Cover credential stuffing, brute force, session abuse, tenant escape, IDOR, privilege escalation, membership-switch abuse, denial bypass, enumeration, and rate-limit bypass. Preserve the Phase 1 Redis-backed rate limit and security headers. Add stricter limits and lockout or step-up requirements where the authentication design requires them.

All externally facing identifiers must be non-sequential. All administrative and privileged operations must be audited. Tests must assert that disabled users, suspended memberships, expired sessions, invalid audiences, invalid issuers, cross-tenant identifiers, unassigned resources, and explicit denials are rejected.

## Required test matrix

| Test group | Minimum acceptance evidence |
|---|---|
| Migration | Fresh database applies all migrations; existing Windows database deploys additively; migration checker passes according to the accepted legacy-state rule. |
| Authentication | Valid OIDC login maps to the correct user; invalid issuer/audience/signature/expiry is rejected; logout and revocation invalidate access. |
| Membership | Active membership grants context; suspended/expired membership is rejected; switching is allowed only among the user’s memberships and is audited. |
| Tenant isolation | Tenant A cannot read, modify, list, search, queue, cache, export, or download Tenant B data. |
| Organization hierarchy | Branch and department scope restrictions are enforced server-side; hierarchy changes are authorized and audited. |
| Authorization | Every frozen matrix role has positive and negative tests, including explicit denials and Platform Admin restrictions. |
| IDOR and enumeration | Random external identifiers do not reveal resource existence across tenant or assignment boundaries. |
| API contract | OpenAPI, response envelopes, error codes, validation, pagination, correlation, and contract tests pass. |
| Idempotency | Repeated state-changing requests do not duplicate the operation; conflicting reuse is rejected; concurrent requests are safe. |
| Outbox | Success, retry, duplicate, lease recovery, dead-letter, cleanup, and handler idempotency pass against real PostgreSQL and Redis. |
| Frontend bilingual | English and Arabic identity/membership flows render correctly with LTR/RTL, accessible labels, validation, and locale-preserving navigation. |
| Security pipeline | Unit, integration, e2e, SAST, dependency, secret, container, SBOM, license, and DAST gates pass for the Phase 2 revision. |

## Phase 2 completion gate

The owner-approved preflight decisions and corrected-plan re-audit authorize Phase 2 application implementation under Option B. The phase is not complete when the schema exists or when login works in a single happy path. It is complete only when the identity and tenancy dependency chain is implemented, secured, tested, runtime-verified, documented, and reviewed against this plan. The evidence must demonstrate that tenant context is derived from membership and that no tenant escape, privilege escalation, IDOR, denial bypass, or unauthorized membership switch remains in the covered surface.

Phase 3 Security Foundation and Audit Foundation cannot begin until this Phase 2 completion gate is approved. After the approved preflight decision set and corrected-plan re-audit are complete, Phase 2 implementation may proceed under Option B. The future Linux KMS/object-storage production gate remains separate, and no unqualified production deployment claim is permitted until that gate is implemented and verified.

## References

1. [`PHASE2_ENTRY_DECISION.md`](PHASE2_ENTRY_DECISION.md)
2. [`PHASE2_PLAN_AUDIT.md`](PHASE2_PLAN_AUDIT.md)
3. [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md)
4. [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md)
5. [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)
6. [`API_ENVELOPE_IDEMPOTENCY_DECISION.md`](API_ENVELOPE_IDEMPOTENCY_DECISION.md)
7. [`RLS_TENANT_ENFORCEMENT_DECISION.md`](RLS_TENANT_ENFORCEMENT_DECISION.md)
8. [`AUDIT_EVENT_FOUNDATION_DECISION.md`](AUDIT_EVENT_FOUNDATION_DECISION.md)
9. [`ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md`](ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md)
10. [`INTEGRATION_TEST_TOPOLOGY.md`](INTEGRATION_TEST_TOPOLOGY.md)
11. [`Phase 0 domain model`](../phase0/DOMAIN_MODEL.md)
12. [`Phase 0 multi-tenancy`](../phase0/MULTI_TENANCY.md)
13. [`Phase 0 authorization`](../phase0/AUTHORIZATION.md)
14. [`Phase 0 authorization matrix`](../phase0/AUTHORIZATION_MATRIX.md)
15. [`Phase 0 stack`](../phase0/STACK.md)
16. [`Phase 0 API contract`](../phase0/API.md)
17. [`Phase 0 database policy`](../phase0/DATABASE.md)
18. [`Phase 0 threat model`](../phase0/THREAT_MODEL.md)
19. [`Phase 0 testing policy`](../phase0/TESTING.md)
20. [`Phase 0 observability policy`](../phase0/OBSERVABILITY.md)
21. [`Phase 0 phase dependencies`](../phase0/PHASE_DEPENDENCIES.md)
22. [`Phase 1 final closure review`](../phase1/FINAL_CLOSURE_REVIEW.md)
23. [`Phase 1 security controls baseline`](../phase1/SECURITY_CONTROLS_BASELINE.md)
24. [`Current Phase 1 Prisma schema`](../../backend/api/prisma/schema.prisma)
25. [`Engineering governance skill`](../../skills/engineering-governance/SKILL.md)
