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

## Workstreams and exit gates

### 1. Identity schema and migration

Design and add the normalized identity schema through an additive Prisma migration. The design must include `User`, `ExternalIdentity` or the approved OIDC subject mapping, `Session` or the approved session reference, and user lifecycle fields. Email uniqueness, normalized identity fields, disabled/deleted states, timestamps, and actor references must be explicit. Secrets such as password hashes or provider credentials must not be stored unless the authentication architecture explicitly requires local credential storage.

The migration must be deployable on the existing Windows PostgreSQL verification database without reset or manual migration-table edits. It must pass fresh-database deployment, migration-checker validation, Prisma generation, schema checks, and rollback/mitigation review. The migration must not modify or reinterpret the accepted legacy migration history.

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

Create a single backend tenant-context mechanism that runs after authentication and before business data access. It must derive the active tenant from a validated membership and an approved session or membership-switch operation. A client-provided `tenantId` may be rejected, ignored, or treated only as a non-authoritative selector; it must never establish trust.

Apply the context consistently to repositories, services, transactions, queues, caches, object-storage metadata, exports, and integrations. Use PostgreSQL RLS where appropriate, with tests proving that application-level mistakes cannot silently create cross-tenant access. Any privileged cross-tenant operation must be a separately named policy, MFA-protected where required, and audited.

### 6. API and frontend contracts

Define Phase 2 REST endpoints under `/api/v1` for identity, membership, tenant selection, and administration. Every endpoint must have OpenAPI documentation, standard success/error envelopes, correlation IDs, validation schemas, authorization policies, and contract tests. State-changing requests must follow the frozen `Idempotency-Key` contract once the HTTP idempotency interceptor/lifecycle is implemented.

The frontend must consume the approved API contract through the generated-client re-entry gate when the Phase 2 surface is stable. English and Arabic message catalogs, locale-aware formatting, `dir="ltr"`/`dir="rtl"`, accessible form errors, and keyboard navigation are mandatory. The frontend must not make authorization decisions that are absent from the backend response.

### 7. Events, audit, and observability

Define identity and membership domain events with explicit event types, versioned payloads, aggregate identifiers, tenant context, correlation ID, and traceparent metadata. Persist the event in the existing transactional outbox when the state change and event publication require atomicity. Verify retries, duplicate delivery, dead-letter behavior, and handler idempotency with real PostgreSQL and Redis.

Define append-only audit event contracts for login, logout, session revocation, membership creation/change/removal, role and permission changes, denial decisions, tenant switching, and privileged access. Redact secrets and avoid storing raw tokens or unnecessary personal payloads. Add bounded metrics and traces without exceeding the documented observability boundary. The first Phase 2 mutation endpoint must provide the API-originated API-to-outbox-to-worker trace continuity re-entry evidence.

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

Phase 2 is not complete when the schema exists or when login works in a single happy path. It is complete only when the identity and tenancy dependency chain is implemented, secured, tested, runtime-verified, documented, and reviewed against this plan. The evidence must demonstrate that tenant context is derived from membership and that no tenant escape, privilege escalation, IDOR, denial bypass, or unauthorized membership switch remains in the covered surface.

Phase 3 Security Foundation and Audit Foundation cannot begin until this Phase 2 completion gate is approved. The future Linux KMS/object-storage production gate remains separate: Phase 2 implementation may proceed under Option B, but no unqualified production deployment claim is permitted until that gate is implemented and verified.

## References

1. [`PHASE2_ENTRY_DECISION.md`](PHASE2_ENTRY_DECISION.md)
2. [`Phase 0 domain model`](../phase0/DOMAIN_MODEL.md)
3. [`Phase 0 multi-tenancy`](../phase0/MULTI_TENANCY.md)
4. [`Phase 0 authorization`](../phase0/AUTHORIZATION.md)
5. [`Phase 0 authorization matrix`](../phase0/AUTHORIZATION_MATRIX.md)
6. [`Phase 0 stack`](../phase0/STACK.md)
7. [`Phase 0 API contract`](../phase0/API.md)
8. [`Phase 0 database policy`](../phase0/DATABASE.md)
9. [`Phase 0 threat model`](../phase0/THREAT_MODEL.md)
10. [`Phase 0 testing policy`](../phase0/TESTING.md)
11. [`Phase 0 observability policy`](../phase0/OBSERVABILITY.md)
12. [`Phase 0 phase dependencies`](../phase0/PHASE_DEPENDENCIES.md)
13. [`Phase 1 final closure review`](../phase1/FINAL_CLOSURE_REVIEW.md)
14. [`Phase 1 security controls baseline`](../phase1/SECURITY_CONTROLS_BASELINE.md)
15. [`Current Phase 1 Prisma schema`](../../backend/api/prisma/schema.prisma)
16. [`Engineering governance skill`](../../skills/engineering-governance/SKILL.md)
