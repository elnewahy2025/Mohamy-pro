# Authorization and MFA Protected Administrative Operation Plan

**Workstream:** Phase 2 authorization policy, MFA assurance, and protected administrative acceptance.

**Status:** Implementation contract. Phase 2 remains open; invitations and later workstreams are not started by this document.

## Purpose

The bounded authorization/RLS/API slice is runtime-verified, but the full authorization/MFA workstream still lacks a real protected administrative operation. This plan adds one production-relevant operation explicitly required by the approved account-lifecycle decision: an authorized administrator revoking all active application sessions for another user.

The operation is intentionally narrower than invitation or role administration. It proves that a state-changing administrative path can combine the server-authoritative policy engine, provider MFA assurance, session revocation, append-only audit persistence, transactional outbox linkage, CSRF/origin protection, idempotency, and controlled API errors without introducing public self-registration or invitation behavior.

## Governing decisions

The operation must follow the frozen authorization matrix, the account-lifecycle decision, the authentication architecture, and the API envelope/idempotency decision. Keycloak remains the owner of credentials and MFA enrollment. Mohamy Pro validates only the provider assurance metadata persisted in the application session. No password, MFA secret, refresh token, or invitation token is stored or accepted by this operation.

The account-lifecycle decision requires recent MFA for session revocation affecting another user. The acceptance profile requires the configured `MFA_REQUIRED_AMR` value, optional exact `MFA_REQUIRED_ACR`, and a provider authentication timestamp no older than `MFA_MAX_AGE_SECONDS` (default fifteen minutes in development/test and bounded to fifteen minutes in production-capable configuration). A browser or frontend assertion cannot satisfy this requirement.

## Endpoint contract

The endpoint is:

```text
POST /api/v1/authorization/users/:userId/sessions/revoke
```

It requires an authenticated application session, a valid CSRF token and approved origin, a valid UUID route parameter, a valid idempotency key, an active server-derived tenant context, and a named `CanManageMembership` authorization decision with recent MFA. The target user must have an active membership in the caller’s current tenant. The endpoint must not accept a client-supplied tenant selector or role claim.

The success payload is an allowlisted object containing only the number of sessions revoked:

```json
{
  "revokedSessionCount": 2
}
```

The standard API success envelope and correlation header are supplied by the existing business interceptor. A repeated request with the same idempotency key replays the stored response; reuse with a different request fingerprint returns the existing conflict envelope.

The endpoint returns the existing controlled authentication, authorization, MFA step-up, validation, conflict, and internal-error envelopes. It must not reveal whether an unrelated user or tenant exists. A target user outside the caller’s active tenant is denied without a resource-existence detail.

## Transaction and audit behavior

The service must validate the target user’s active membership inside the same transaction context used for tenant authorization. It must update only active application sessions belonging to that target user, clearing provider refresh-token and CSRF ciphertext fields as part of revocation. It must emit one aggregate `auth.session.revoked` audit event with the named policy and a bounded numeric session count. The audit event must be tenant-scoped, use the actor’s server-derived membership context, and create its linked outbox message in the same transaction.

The operation must be idempotent at the HTTP boundary and safe under concurrent requests. A second successful request after the first revocation may return a zero count under a new idempotency key, while the same key must replay the original response. The service must not revoke the caller’s own session through this endpoint; another-user targeting is an explicit invariant.

## Authorization semantics

The endpoint uses `CanManageMembership`, because session revocation for another user is an administrative membership/security operation. The current policy engine must enforce an active authenticated user, active target-tenant membership, the persisted `membership.manage` permission, explicit-denial evaluation, tenant escape prevention, and recent MFA. The route must not use `CanPerformPlatformOperation` because this operation is tenant-scoped and must not create a cross-tenant path.

Platform Admin remains the only cross-tenant role in the frozen matrix, but this endpoint does not expose cross-tenant behavior. Tenant Admin cannot use this operation to elevate anyone or alter roles. The target user’s membership is checked server-side and the actor’s active tenant is the only tenant boundary.

## Required tests

Unit tests must cover target-user UUID validation, self-target rejection, missing target membership, target membership in the active tenant, no active target sessions, revocation of all active target sessions, preservation of already-revoked sessions, ciphertext clearing, aggregate audit input, tenant context binding, and error propagation. Authorization tests must cover missing permission, explicit denial, tenant escape, and missing/stale/wrong provider MFA claims. Interceptor tests must cover required idempotency and replay/conflict behavior.

The real runtime verifier must use the actual Keycloak OIDC session and restricted PostgreSQL role. It must prove at least the missing-MFA denial path against the real route and, when a real provider test account with a recent configured MFA result is available, prove the successful administrative revocation path and audit/outbox evidence. It must never manufacture provider MFA claims by mutating application rows or accepting a frontend flag. If the positive provider-MFA case is not available in the current Keycloak realm, the result remains explicitly unverified rather than being relabeled as a pass.

## Security and privacy constraints

No raw target identifiers, cookies, authorization codes, provider tokens, refresh tokens, MFA material, email addresses, or complete identity payloads may be logged. Audit metadata contains only bounded outcome labels and a numeric count. The implementation must not disable RLS, add `BYPASSRLS`, grant broad privileges, bypass the named policy, disable the append-only trigger, or alter applied migration history.

## Acceptance gate

This slice is accepted only after the affected local static gates pass; the real route’s missing-MFA denial is verified; any claimed successful path is backed by a genuine provider MFA result; session revocation, tenant-scoped audit/outbox linkage, idempotency, and cleanup evidence pass; the canonical runtime evidence is published; and the full authorization/MFA status is updated without claiming Phase 2 complete or production ready.

## References

1. [`AUTHORIZATION_MATRIX.md`](../phase0/AUTHORIZATION_MATRIX.md)
2. [`AUTHORIZATION.md`](../phase0/AUTHORIZATION.md)
3. [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md)
4. [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md)
5. [`API_ENVELOPE_IDEMPOTENCY_DECISION.md`](API_ENVELOPE_IDEMPOTENCY_DECISION.md)
6. [`AUTHORIZATION_MFA_IMPLEMENTATION_PLAN.md`](AUTHORIZATION_MFA_IMPLEMENTATION_PLAN.md)
7. [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md)
8. [`engineering-governance/SKILL.md`](../../skills/engineering-governance/SKILL.md)
