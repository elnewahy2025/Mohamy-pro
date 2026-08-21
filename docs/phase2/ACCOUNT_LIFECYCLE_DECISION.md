# Phase 2 Account Lifecycle and Session Ownership Decision

**Decision status:** Approved by the project owner as part of the standing Phase 2 preflight approval on 2026-08-22.

**Decision date:** 2026-08-22

**Depends on:** [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md)

## Ownership boundary

The system has two related but separate lifecycles:

| Concern | Owner | Rule |
|---|---|---|
| Authentication credentials | Keycloak | Mohamy Pro does not store passwords, password hashes, recovery answers, or provider MFA secrets. |
| Email verification and provider recovery | Keycloak | Application membership is not activated solely because a provider account exists. |
| MFA enrollment and provider authentication | Keycloak | Staff-sensitive application paths require a verified MFA result from the provider. |
| OIDC subject and external identity mapping | Mohamy Pro | The immutable provider subject is mapped to one application `User` through `ExternalIdentity`. |
| User profile needed by legal operations | Mohamy Pro | Only the minimum required profile fields are stored; provider claims are not copied wholesale. |
| Tenant membership and invitation | Mohamy Pro | Membership is application-owned and is the prerequisite for tenant context. |
| Roles, permissions, denials, scope assignments | Mohamy Pro | Authorization is evaluated by the application and database boundaries, not by frontend claims. |
| Application sessions | Mohamy Pro | Session records, revocation, idle/absolute expiry, CSRF state, and audit events are application-owned. |

## User lifecycle

The application `User` lifecycle is explicit:

| State | Meaning | Allowed application behavior |
|---|---|---|
| `PENDING` | OIDC identity is known, but application onboarding or invitation completion is not finished | May complete the approved onboarding/invitation flow; cannot access tenant data. |
| `ACTIVE` | Application user is enabled and may use active memberships | May authenticate and receive tenant context through an active membership. |
| `SUSPENDED` | Application access is temporarily disabled by an authorized administrative operation | All sessions are revoked; no new session or tenant context is allowed. |
| `DISABLED` | Application access is disabled indefinitely but the identity record is retained for audit and referential integrity | All sessions are revoked; login is denied without revealing account state to an unauthenticated caller. |
| `DELETED` | Application identity is logically deleted or anonymized according to the data-lifecycle decision | No login or tenant context; records required for legal/audit integrity are retained in redacted form. |

Keycloak account status is evaluated at login and at the provider/session reconciliation boundary. A disabled provider account cannot establish a new application session. A provider outage cannot be treated as proof that the account is disabled; the application fails closed for operations requiring fresh provider validation and does not silently downgrade to cached identity state.

## Onboarding and invitations

There is no public self-registration endpoint in Phase 2. A user becomes an application user through one of the following controlled paths:

1. A Platform Admin or authorized tenant administrator creates an application invitation for an approved email address and tenant role/scope.
2. The recipient authenticates through Keycloak or completes the provider-owned account setup.
3. The API validates the signed invitation, expiry, intended email or provider subject binding, inviter permission, tenant state, and requested role restrictions.
4. The API creates or links the `User` and `ExternalIdentity`, creates the `Membership` in a non-active or active state according to the invitation workflow, and emits the required audit/outbox events.
5. The recipient may access tenant data only after the application membership becomes active.

An existing Keycloak identity with no application membership is not granted access to any tenant. A user with multiple active memberships must select a tenant through the dedicated server-validated switch flow before tenant-scoped access is granted. A user with zero active memberships receives a controlled no-membership result and cannot access tenant data.

Invitations are single-use, expire, are bound to the intended onboarding context, and are not accepted after the target tenant or inviter loses authority. Invitation tokens are opaque, short-lived, hashed at rest, excluded from logs, and invalidated after completion or explicit revocation.

## MFA and sensitive paths

Keycloak owns MFA enrollment and challenge. Mohamy Pro requires the provider authentication result to contain the configured MFA assurance claim for staff-sensitive paths. The API must validate the relevant `amr`/`acr` claim and the recent authentication time; a frontend assertion is never sufficient.

The following require recent MFA or an approved step-up flow:

- Platform Admin operations and any cross-tenant operation.
- Role, permission, denial, or membership administration.
- Tenant bootstrap and first-administrator assignment.
- Session revocation for another user.
- Export, legal-hold, retention, or other sensitive data operations when the policy marks them as staff-sensitive.

The required assurance value and maximum authentication age are configuration values validated at startup. The default acceptance profile requires MFA and authentication within 15 minutes for staff-sensitive operations. The API returns a controlled step-up-required error without exposing protected resource details.

## Session lifecycle

The application session is separate from the Keycloak SSO session:

| Event | Application behavior |
|---|---|
| Login success | Create a session record with a hash of the opaque cookie ID, user ID, provider subject, issued time, idle expiry, absolute expiry, last-used time, provider session identifier where available, and encrypted provider refresh token. |
| Request | Validate cookie, session hash, user state, session state, idle expiry, absolute expiry, and membership state before establishing request context. Update last-used time under a bounded write policy. |
| Refresh | Use the encrypted provider refresh token only server-side; rotate and replace it atomically when a new refresh token is returned. |
| Logout current session | Revoke the application session, attempt provider revocation through the approved adapter, clear the cookie, and emit an audit event. |
| Logout all sessions | Revoke every active application session for the user, require recent MFA for another-user administration, and emit one aggregate audit event plus per-session state where required. |
| Idle expiry | Revoke the session after 30 minutes without an authenticated request. |
| Absolute expiry | Revoke the session after 12 hours, requiring a new authorization-code login. |
| Refresh failure | Revoke the session, clear the cookie, return an authentication-required result, and never retry indefinitely. |
| User suspension/disable | Revoke all active sessions in one transaction and prevent context creation. |
| Membership suspension/expiry | Keep the user session if other memberships remain, but deny the affected tenant and require an approved switch to another active membership. |
| Provider logout/back-channel event | Revoke the mapped application session(s) when a verified provider event is received; an unverified event is rejected and logged as a security event without changing state. |

Access tokens are short-lived and never persisted in the browser. The acceptance profile uses a five-minute maximum access-token lifetime, subject to the Keycloak realm configuration evidence. The application session absolute and idle limits remain application controls even if provider token settings are changed.

## Security and privacy rules

Session identifiers are generated with a cryptographically secure random source, stored only as hashes, and compared using a constant-time-safe strategy. Provider refresh tokens are encrypted with authenticated encryption using the environment-only session encryption key. Key rotation requires a versioned key identifier and a migration/re-encryption procedure; a missing or invalid key fails startup in production.

Logs and traces may contain correlation IDs, user-safe event identifiers, provider issuer, and non-sensitive outcome labels. They must not contain access tokens, refresh tokens, invitation tokens, password material, MFA secrets, raw cookies, authorization codes, or complete identity payloads. Metrics use bounded labels and never use email addresses, subject identifiers, tenant IDs, or tokens as unbounded labels.

## Required acceptance evidence

| Requirement | Required proof |
|---|---|
| Provider ownership | Real Keycloak test realm demonstrates provider password, verification, recovery, and MFA flows without application password storage. |
| Onboarding | Invitation success, expired invitation, reused invitation, wrong identity, unauthorized inviter, zero-membership, and multi-membership cases are tested against real PostgreSQL. |
| User state | `PENDING`, `ACTIVE`, `SUSPENDED`, `DISABLED`, and `DELETED` behavior is tested with persisted state and controlled responses. |
| MFA | Sensitive operations reject missing/stale/non-MFA assurance and accept a valid recent provider MFA result. |
| Session | Login creates an application session; cookie is opaque and HttpOnly; refresh token is encrypted server-side; idle and absolute expiry revoke access. |
| Revocation | Current-session, all-session, user-suspension, membership-suspension, provider-revocation, and refresh-failure paths revoke access and persist audit events. |
| Privacy | Focused log/trace scan proves that token, password, MFA, invitation, and raw-cookie material is not emitted. |
| Failure behavior | Keycloak outage, invalid discovery, invalid JWKS, provider timeout, and refresh failure fail closed without account enumeration. |

## References

1. [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md)
2. [`Phase 0 authorization`](../phase0/AUTHORIZATION.md)
3. [`Phase 0 multi-tenancy`](../phase0/MULTI_TENANCY.md)
4. [`Phase 0 threat model`](../phase0/THREAT_MODEL.md)
5. [`Phase 0 data classification`](../phase0/DATA_CLASSIFICATION.md)
6. [`Phase 2 plan audit`](PHASE2_PLAN_AUDIT.md)
7. [`Phase 2 implementation plan`](PHASE2_IMPLEMENTATION_PLAN.md)
