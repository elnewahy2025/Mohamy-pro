# Phase 2 Authentication, Session, and OIDC Implementation Plan

**Status:** Authorized implementation plan for the next Phase 2 workstream. This document defines the implementation boundary; it is not evidence that the work is complete.

**Date:** 2026-08-22

**Dependency decision:** Authentication and the server-mediated session boundary are the next workstream because tenant context must be derived from an authenticated application identity and active membership before the remaining authorization, tenant-switch, audit, API mutation, and frontend flows can be closed.

## 1. Current audited state

The approved architecture selects self-hosted Keycloak as the OpenID Connect provider, Authorization Code with PKCE for the browser login flow, and a server-mediated opaque session cookie. The browser must never receive or store access or refresh tokens.[1]

The repository currently contains the Phase 2 identity schema foundation—`User`, `ExternalIdentity`, `AppSession`, and `Membership`—but no authentication module, OIDC client, session service, login/callback/logout routes, CSRF middleware, session guard, or frontend authentication state. The API bootstrap currently enables CORS with `credentials: false`, exposes only the root and health/metrics routes, and has no authentication guard. The frontend has locale-aware English/Arabic layout and navigation but no session bootstrap, login/logout flow, auth route guard, or tenant selector.

The existing logger already redacts authorization headers, cookies, and response `Set-Cookie` values. The existing Redis service provides the connection used by BullMQ and supports bounded `get`, `set`, and `del` operations. The existing Prisma service provides interactive transactions and the global/tenant context helpers required by later authenticated membership selection.

## 2. Selected implementation boundary

The implementation will add a server-side `AuthModule` to the API and keep provider-specific protocol code behind an OIDC adapter. The first production-wired slice will provide the following concrete behavior:

| Capability | Boundary selected for this slice |
|---|---|
| Login start | `GET /api/v1/auth/login` creates a short-lived Redis authorization transaction containing state, nonce, PKCE verifier, redirect URI, and a post-login return target, then redirects to the discovered Keycloak authorization endpoint. |
| Authorization callback | `GET /api/v1/auth/callback` validates the stored state, exchanges the one-time code, validates ID-token issuer, audience, signature, algorithm, expiry, not-before, nonce, and required subject, then maps the immutable provider subject to `ExternalIdentity`/`User`. |
| Session creation | The API generates a cryptographically random opaque session identifier and CSRF secret, stores only their SHA-256 hashes, encrypts the provider refresh token with authenticated encryption, records bounded idle/absolute expiry, and returns only an `HttpOnly` session cookie. |
| Current session | `GET /api/v1/auth/session` validates the cookie hash, session state, user state, expiry, and active membership status, returning a redacted server-derived session view. No raw token or provider payload is returned. |
| CSRF bootstrap | `GET /api/v1/auth/csrf` requires the authenticated session and returns the CSRF token only to the authenticated browser session. The CSRF token is not the session secret. |
| Logout | `POST /api/v1/auth/logout` requires the session cookie, approved `Origin`, and matching CSRF token; it revokes the application session, clears the cookie, and attempts provider revocation through the adapter without exposing provider errors. Repeated logout is safe. |
| Request authentication | An explicit session guard protects the new session and CSRF endpoints and provides a reusable request-context object for subsequent protected endpoints. Existing public health and root endpoints remain public until their endpoint policy is explicitly changed. |
| State-changing browser requests | A global middleware rejects cookie-authenticated state-changing requests without an exact approved `Origin` and constant-time-matching `X-CSRF-Token` before controller execution. `GET`, `HEAD`, and `OPTIONS` remain exempt. |
| Provider failure | Discovery, token exchange, JWKS, validation, refresh, and revocation failures fail closed and return controlled non-enumerating authentication errors. No indefinite refresh retry is permitted. |

## 3. OIDC protocol choices

The OIDC adapter will use discovery from the configured issuer rather than hard-coded provider endpoints. It will cache discovery and JWKS material with bounded freshness, use request timeouts, and fail closed when the provider or key set cannot be validated. The adapter will use `jose` for standards-based JWT/JWS verification and remote JWKS resolution rather than implementing cryptographic parsing manually.

The authorization request will use `response_type=code`, `code_challenge_method=S256`, a fresh random `state`, a fresh random `nonce`, the configured exact redirect URI, and the approved scopes. The callback will reject missing, reused, expired, or mismatched state; a missing or mismatched nonce; an invalid issuer or audience; an unapproved signing algorithm; an expired or not-yet-valid token; and an absent subject. Direct grant/password, implicit, and hybrid browser token flows will not be implemented.[1] [2]

The provider subject will be mapped only through `(provider, subject)`. Email claims will not silently link an existing application user. A successful provider authentication without an active application membership will create or retain a non-authorized application identity state but will not establish tenant context or grant tenant data access.[3]

## 4. Session and cryptographic choices

The application session record is the authoritative browser session boundary. The raw session cookie value and CSRF secret are generated with Node’s cryptographically secure random source and stored only as SHA-256 hashes. Session lookup uses the hash and validates user/session state, idle expiry, absolute expiry, and membership state inside the application boundary.

Provider refresh tokens are encrypted with AES-256-GCM using a 32-byte environment-only key and a versioned key identifier. The ciphertext record contains the version, nonce, authentication tag, and ciphertext; it never contains the plaintext token. Encryption and decryption reject invalid key length, unsupported version, authentication-tag failure, and malformed ciphertext. The application will not log tokens, raw cookies, authorization codes, invitation tokens, MFA material, or complete provider claims.

The configured acceptance profile uses a 30-minute idle session lifetime, a 12-hour absolute lifetime, and a five-minute maximum access-token lifetime subject to the Keycloak realm evidence. Production validation will require secure cookies, exact HTTPS origins, a 32-byte session encryption key, and all OIDC settings. Local HTTP verification may explicitly set `Secure=false` only in development mode.

## 5. Database and membership boundary

Session creation, external-identity mapping, and any first-time user record creation will use one transaction. The callback will never set a tenant context from an OIDC claim. Active tenant context remains a later membership-derived operation governed by [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md).

The session service will distinguish these states:

| Condition | Authentication/session result |
|---|---|
| Valid provider identity and active application user | Application session may be created. |
| Provider identity with no active membership | Session may exist for controlled onboarding/session inspection, but tenant context is denied. |
| Suspended, disabled, or deleted application user | Session creation and authenticated access are denied; existing sessions are revoked according to lifecycle rules. |
| Suspended, expired, or removed membership | The affected tenant is denied; another active membership may be selected only through the later validated switch operation. |
| Provider discovery/JWKS/token failure | Authentication fails closed without treating outage as proof of disablement or revealing account existence. |

The first implementation slice will not silently implement invitations, membership activation, tenant switching, role authorization, audit persistence, or Platform Admin bootstrap. Those flows remain explicit Phase 2 follow-on work and are not replaced by a login happy path.

## 6. CSRF, origin, CORS, and error boundary

Because the selected transport is a cookie-backed application session, the API will enable credentialed CORS only for exact configured origins. Wildcard origins and credentialed wildcard CORS are rejected by validation. The origin middleware will compare the request `Origin` against the normalized configured allowlist and will reject a missing origin for state-changing browser requests unless the request is an explicitly documented non-browser internal operation.

The CSRF middleware will compare the request header with the server-side session CSRF hash using a constant-time-safe comparison. It will reject missing, malformed, expired, or mismatched session cookies and CSRF tokens before controller execution. Authentication errors will use controlled status and error codes without account enumeration. The current legacy HTTP error body remains in place until the separate API-envelope workstream is implemented; the new auth errors will be compatible with that boundary and will not claim the envelope gate is closed.

## 7. Acceptance and verification matrix

| Requirement | Implementation | Tests | Runtime evidence | Status before implementation |
|---|---|---|---|---|
| OIDC discovery | Adapter fetches and validates issuer/discovery with timeout and bounded cache | Discovery success, issuer mismatch, timeout, malformed metadata | Real Keycloak realm discovery | MISSING |
| Authorization Code + PKCE | Login/callback routes use state, nonce, verifier, S256 challenge, exact redirect URI | State replay/mismatch, nonce mismatch, verifier exchange, redirect mismatch | Real browser/API callback against Keycloak | MISSING |
| JWT validation | `jose` remote JWKS with issuer/audience/alg/exp/nbf checks | Wrong issuer/audience/signature/algorithm/expiry/nbf/subject and JWKS rotation | Real Keycloak ID/access tokens | MISSING |
| Subject mapping | Provider/subject uniqueness and no implicit email linking | New subject, existing subject, conflicting email, disabled user | PostgreSQL persisted identity/session state | MISSING |
| Session boundary | Opaque cookie, hash-only lookup, encrypted refresh token, idle/absolute expiry | Cookie opacity, hash lookup, tampering, expiry, revocation, refresh failure | API response headers/log scan and database inspection | MISSING |
| CSRF/origin | Exact origin and constant-time CSRF validation before controllers | Missing/mismatch/cross-origin rejection and valid mutation | Real API requests with cookie session | MISSING |
| Logout | Application revocation, cookie clearing, provider revocation attempt, idempotence | Current logout, repeated logout, provider failure | Real API session state and response headers | MISSING |
| User/membership gate | User state and active membership checked before tenant context | Pending/suspended/disabled/deleted/zero-membership cases | PostgreSQL-backed session/current-user flow | MISSING |
| Privacy | Logger redaction plus explicit auth log/trace policy | Repository secret scan and auth log assertions | Runtime log review | PARTIAL |
| Production configuration | Fail-closed validation of OIDC, session, cookie, CORS, CSRF settings | Missing/insecure production configuration cases | API startup against controlled configuration | MISSING |

## 8. Runtime topology

Windows verification will use a separate Keycloak development container with a pinned version reference, persistent local data, health checks, an imported application realm, and a test client. Keycloak admin credentials and client secrets will be supplied through local protected environment files only; they will not be committed or printed. Keycloak `start-dev` is acceptable only for the explicitly qualified development/verification plane and is not production evidence.[4]

The API, worker, Keycloak, PostgreSQL, Redis, and MinIO topology will be tested without resetting the existing `mohamy_pro` database or touching unrelated containers. The real integration gate will verify discovery, login redirect construction, code exchange, claim validation, session cookie behavior, CSRF/origin rejection, logout, revoked/expired session behavior, and provider failure handling. Unit tests may use isolated cryptographic test fixtures, but production code will never use fake authentication results or a development bypass.

## 9. Explicit non-closure

This implementation plan does not close authorization policies, membership switching, invitation onboarding, audit events, API envelopes, HTTP idempotency enforcement, abuse/lifecycle controls, frontend authentication/tenant UX, generated client integration, or the Linux KMS/object-storage production boundary. Phase 3 remains blocked until the complete Phase 2 completion gate is approved.

## References

[1]: AUTHENTICATION_ARCHITECTURE_DECISION.md "Phase 2 Authentication Architecture Decision"
[2]: https://www.keycloak.org/securing-apps/oidc-layers "Keycloak OpenID Connect layers and endpoints"
[3]: ACCOUNT_LIFECYCLE_DECISION.md "Phase 2 Account Lifecycle and Session Ownership Decision"
[4]: https://www.keycloak.org/server/containers "Keycloak running in a container"
[5]: TENANT_MEMBERSHIP_SWITCHING_DECISION.md "Phase 2 Tenant, Membership, and Switching Decision"
[6]: PHASE2_IMPLEMENTATION_PLAN.md "Phase 2 Implementation Plan — Identity and Multi-Tenancy"
[7]: ../../skills/engineering-governance/SKILL.md "Engineering governance skill"
