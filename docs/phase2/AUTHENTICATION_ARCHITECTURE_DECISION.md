# Phase 2 Authentication Architecture Decision

**Decision status:** Approved by the project owner as part of the standing Phase 2 preflight approval on 2026-08-22; no application code is authorized until the full corrected-plan re-audit is accepted.

**Decision date:** 2026-08-22

## Decision

Mohamy Pro will use **self-hosted Keycloak as the OpenID Connect provider** for Windows-Docker development and verification. The application will use the **Authorization Code flow with PKCE**. The browser will not receive or store access tokens or refresh tokens.

The Next.js frontend and NestJS API will use a server-mediated session boundary:

1. The browser starts login at the API.
2. The API redirects the browser to the configured Keycloak realm authorization endpoint with state, nonce, PKCE S256 challenge, exact redirect URI, client ID, and required scopes.
3. Keycloak authenticates the user and redirects the authorization code to the API callback.
4. The API exchanges the code at the Keycloak token endpoint, validates the returned ID/access-token claims and nonce, resolves the OIDC subject to the application `User`, and creates an application session.
5. The API sets an opaque, random, `HttpOnly` session cookie. The database stores only a hash of the opaque session identifier and an encrypted provider refresh token. The raw tokens are never returned to the browser, logged, or placed in frontend state.
6. The API validates bearer access tokens locally using the issuer’s discovered JWKS, with issuer, audience, algorithm, expiry, not-before, and clock-skew checks. The API refreshes the provider access token server-side when required and rotates the provider refresh token when Keycloak returns one.
7. Logout revokes the server-side session, attempts provider refresh-token revocation through the approved OIDC endpoint, clears the cookie, and is idempotent.

This decision keeps the application `Tenant` as the legal-operations security boundary. Keycloak’s realm is the identity-provider boundary, not the application tenant. Mohamy Pro will use one dedicated Keycloak realm for the application during this phase; application `Tenant` records and authenticated `Membership` records enforce tenant isolation.

## Token and cookie transport

The session cookie is named `mohamy_session`, contains no user or tenant data, and is configured as follows:

| Setting | Development | Production-capable deployment gate |
|---|---|---|
| `HttpOnly` | `true` | `true` |
| `Secure` | `false` only for explicitly local HTTP verification | `true`; production rejects insecure cookie configuration |
| `SameSite` | `Lax` | `Lax` unless a separately approved cross-site deployment requires a stricter documented design |
| `Path` | `/` | `/` |
| Domain | Host-only | Host-only unless an approved domain architecture requires otherwise |
| Credentials | API CORS allows only configured exact origins | No wildcard origin; exact HTTPS origins only |
| Browser access token | Never exposed | Never exposed |

The API does not accept a browser-controlled tenant cookie or tenant header as authoritative context. The active tenant is derived from the authenticated application session and validated membership. A separate membership-switch operation is defined in the tenancy decision and audits every switch.

Because the application uses a cookie-authenticated session, all state-changing requests require both:

- an `Origin` value matching the configured exact frontend origin; and
- an `X-CSRF-Token` matching the server-side CSRF secret associated with the application session, compared in constant time.

`GET`, `HEAD`, and `OPTIONS` requests do not mutate state and do not require the CSRF token. The CSRF token is returned only through an authenticated API endpoint and is not the session secret. The API must reject missing, mismatched, or cross-origin state-changing requests before controller execution.

## Provider ownership and account lifecycle

Keycloak owns authentication credentials and provider-controlled account functions: password policy, password reset, email verification, MFA enrollment and challenge, provider session, and OIDC token issuance. Mohamy Pro owns the application `User` mapping, user profile fields needed by the legal-operations platform, tenant `Membership`, tenant invitation state, role and permission assignments, tenant switching, suspension within the application, and application audit events.

An application user cannot become active in a tenant merely because a Keycloak account exists. The user must have an active application membership. A suspended or expired application membership blocks tenant context even when the Keycloak identity remains valid. A disabled application user blocks all application sessions. Provider account deletion or disablement is reconciled to the application through the approved provider adapter and must fail closed if the provider status cannot be established for a required operation.

Tenant invitations are application-owned records. An invitation may direct the recipient to Keycloak for authentication or account creation, but membership becomes active only after the application validates the invitation, the authenticated OIDC subject, the invitation expiry, and the inviter’s authorization. Tenant administrators cannot grant Platform Admin privileges.

## Required configuration

The API must add fail-closed production validation for the following configuration, without committing values:

| Configuration | Purpose |
|---|---|
| OIDC issuer URL | Keycloak realm issuer and discovery root |
| OIDC client ID | Server-side application client identifier |
| OIDC client secret | Confidential-client exchange secret, if the selected client registration requires it |
| OIDC audience | Accepted API/client audience |
| OIDC redirect URI | Exact API callback URI |
| OIDC post-logout redirect URI | Exact allowed logout return URI |
| OIDC JWKS/discovery cache policy | Key rotation and availability behavior |
| Session cookie name/options | Secure browser session boundary |
| Session encryption key | 32-byte key for authenticated encryption of provider refresh tokens; value is environment-only |
| Session absolute and idle TTL | Bounded session lifetime and inactivity expiry |
| CSRF/session settings | Cookie-session state-changing request protection |
| Exact CORS origins | Credentialed browser-origin allowlist |

The API must refuse production startup when any required OIDC, session encryption, secure-cookie, exact-origin, or CSRF configuration is missing or insecure.

## Keycloak runtime boundary

For Windows-Docker development and verification, Keycloak will run as a separate existing or newly provisioned container with persistent data, a pinned image reference, health checks, a dedicated application realm, and a test client. The exact image digest, database topology, ports, realm export, client registration, and non-secret configuration must be recorded before runtime verification. Initial admin credentials and client secrets must be supplied through protected environment variables or files and must never be committed or printed.

Keycloak’s official container guide documents `start-dev` as a development/testing mode and states that it must be avoided in production; the production-capable deployment gate therefore requires a supported database, TLS, secure bootstrap credentials, bounded resources, health, and operational evidence.[1] The current Windows-Docker environment is only the Phase 2 development and verification plane under Option B and does not close the Phase 1 production deployment boundary.

## Required acceptance evidence

| Requirement | Evidence required |
|---|---|
| Discovery and issuer | Real Keycloak realm discovery document captured without secrets; issuer and JWKS URI match configuration. |
| Authorization Code + PKCE | Real browser/API integration completes code exchange with state, nonce, and S256 PKCE validation. No direct-grant/password flow is used by the application. |
| Token validation | Tests reject wrong issuer, audience, signature, algorithm, expiry, not-before, nonce, and malformed tokens. JWKS rotation behavior is tested. |
| Session boundary | Browser receives only an opaque HttpOnly cookie; refresh token is encrypted server-side; logs contain no tokens; logout revokes and clears the session. |
| CSRF and origin | State-changing requests fail without the correct CSRF token or approved Origin and succeed only with both. Read-only endpoints remain usable without the token. |
| Account lifecycle | Provider-owned password, verification, recovery, and MFA flows are exercised through the real test provider; application membership still gates access. |
| Failure behavior | Provider outage, discovery failure, JWKS failure, token refresh failure, revoked session, disabled application user, and suspended membership fail closed without leaking secrets. |
| Runtime | API and worker start with the configured provider boundary, readiness exposes provider dependency state appropriately, and graceful shutdown closes provider/session resources. |

## Explicit non-decisions

This decision does not authorize password storage in the Mohamy database, browser localStorage/sessionStorage token storage, OAuth implicit flow, resource-owner-password flow, wildcard credentialed CORS, tenant-per-realm mapping, frontend-only authorization, or a production Keycloak deployment claim on Windows Docker.

## References

1. [Keycloak — Running Keycloak in a container](https://www.keycloak.org/server/containers)
2. [Keycloak — Docker getting started](https://www.keycloak.org/getting-started/getting-started-docker)
3. [Keycloak — OpenID Connect layers and endpoints](https://www.keycloak.org/securing-apps/oidc-layers)
4. [`Phase 0 stack`](../phase0/STACK.md)
5. [`Phase 0 API contract`](../phase0/API.md)
6. [`Phase 0 threat model`](../phase0/THREAT_MODEL.md)
7. [`Phase 2 plan audit`](PHASE2_PLAN_AUDIT.md)
8. [`Phase 2 entry decision`](PHASE2_ENTRY_DECISION.md)
