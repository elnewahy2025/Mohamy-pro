# Phase 2 Hosted OIDC + Session Verification

**Date:** 2026-08-29 (updated)

**Repository revision:** working tree of `Mohamy-pro` (elnewahy2025/Mohamy-pro).
Commit `7e0f0774` (and dependencies) contains the OIDC adapter + session fix.

**Environment:** API runs locally on the user's Windows 11 PC (Node, pnpm 11.22.0);
online backends are Neon (PostgreSQL), Upstash (Redis), MinIO (S3), and Keycloak (OIDC).
The OIDC provider is **hosted Keycloak** (`https://keycloak-production-1aa4.up.railway.app`,
realm `mohamy`). This build closes the "auth: build OIDC adapter + sessions" condition from
the Phase 2 plan.

> **History note:** the first incarnation of this workstream used hosted **Logto**
> (Logto Cloud) and the `Mohamy-Backup` repo. Logto's free tier blocked Traditional
> web apps (OAuth Authorization-Code flows) behind Pro, so the provider was switched to
> **Keycloak** and work moved to the **`Mohamy-pro`** repo. This doc now reflects the
> current Keycloak/Mohamy-pro state.

## Purpose

Implement and verify the auth groundwork for Phase 2 identity + multi-tenancy: a hosted-Keycloak
OIDC (OpenID Connect) adapter (Authorization Code + PKCE S256) and a server-side session store
(opaque HttpOnly session cookie backed by the `AppSession` table in Neon), plus the OIDC
interaction cookie and CSRF protection. Clearly separate what was **actually verified at runtime**
from what **requires a human browser round-trip** and therefore cannot be claimed as verified yet.

## What is implemented (source under `backend/api/src/auth/`)

- **`oidc/oidc-provider.service.ts`** — OIDC client built on `openid-client@6.8.7`: dynamic
  provider discovery, Authorization Code flow with **PKCE S256**, `expectedState`/`expectedNonce`
  correlation, refresh-token grant, RFC 7009 token revocation, end-session URL, and
  ID-token claims→`OidcProfile` mapping.
- **`identity.service.ts`** — resolves the OIDC `subject` to a local `User` via `ExternalIdentity`
  (compound unique `provider_subject`), creating/linking a user (PENDING) in a Neon transaction
  when first seen (email-normalized reuse).
- **`session/session-crypto.ts`** — pure `node:crypto`: opaque token generation, SHA-256 token
  hashing, constant-time compare, and AES-256-GCM encryption (key derived via HKDF-SHA256 from
  `SESSION_SECRET`) for the encrypted provider refresh token and the OIDC interaction payload
  (`v1.iv.tag.ciphertext`). No hand-rolled crypto.
- **`session/session-cookie.service.ts`** — HttpOnly `SameSite=Lax` session cookie
  (`SESSION_COOKIE_NAME`, default `mohamy_session`, secure in production) plus the 15-minute
  `mohamy_oidc` interaction cookie that carries the encrypted `{state, nonce, codeVerifier}`
  across the redirect.
- **`session/session.service.ts`** — `AppSession` lifecycle: create (hashes token + CSRF token,
  encrypts refresh token, idle + absolute TTLs), validate (status, idle/absolute expiry→EXPIRED,
  user permitted, bump `lastUsedAt`), revoke, refresh-token read/rotate, active-tenant switch,
  and CSRF issue/verify (constant-time hash compare).
- **`session/session.guard.ts` / `session/csrf.guard.ts`** — guards: `SessionGuard` attaches
  `request.auth` from the session cookie; `CsrfGuard` enforces Origin ∈ `CORS_ORIGINS` +
  `X-CSRF-Token` on `POST/PUT/PATCH/DELETE`.
- **`auth.service.ts` / `auth.controller.ts` / `auth.module.ts`** — routes
  `GET /api/v1/auth/login`, `/auth/callback`, `/auth/csrf` (Session+Csrf guarded), `/auth/me`
  (Session guarded), `POST /auth/logout`.
- **`config/env.validation.ts`** — new `OIDC_*` / `SESSION_*` settings; **fail-closed in
  production** (requires `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
  `OIDC_REDIRECT_URI`, `SESSION_SECRET` ≥ 32 chars, `SESSION_SECURE_COOKIE=true`); dev/test get
  safe defaults so the worker process and test suite still boot.

## Verified in this sandbox (evidence cross-checked live where possible)

1. **Build clean:** `nest build` → `exit 0`, 0 TS errors.
2. **Lint clean:** `eslint` on all auth files + the changed config file → `exit 0` (only the
   standard `no-unsafe-*` warnings from `as any` mock objects, consistent with existing specs).
3. **Auth unit tests pass (42) in 6 suites** — `session-crypto`, `session.service`,
   `session.guard`, `csrf.guard`, `identity.service`, `oidc-provider.service`, and
   `env.validation`. Full repo suite green as well.

   ```text
   Test Suites: 6 passed, 6 total
   Tests:       42 passed, 42 total
   ```

4. **Live Keycloak discovery re-probed** against
   `https://keycloak-production-1aa4.up.railway.app/realms/mohamy/.well-known/openid-configuration`
   (public metadata only, no secrets). Confirms the Authorization Code + refresh-token grants,
   PKCE `S256`, `client_secret_post` / `client_secret_basic` token auth methods, and the
   revocation / end-session endpoints the adapter uses.
5. **Secrets safe:** the credential-bearing file `backend/api/.env` is **gitignored** (`.env`
   entry in `.gitignore`); the tracked tree shows only expected source changes and no `.env`
   commit. OIDC client id/secret and the redirect URI are not present in any tracked file.

## Defect found & fixed (root cause of the previous `unauthorized_client`)

A real Keycloak login produced a `500` at `/auth/callback` with an `OidcInteractionError`
wrapping oauth `unauthorized_client`. The cause was **not** a Keycloak configuration problem —
the client secret and `Client authentication` were both correct. Instead, `oidc-provider.service.ts`
called `client.discovery(issuer, clientId, { clientSecret })` passing the secret under a
**camelCase** key. `openid-client` reads `client_secret` from `ClientMetadata`; the camelCase key did
not map, so `client_secret` stayed `undefined`, the client fell back to **no client authentication**,
and the token request carried no credentials. Keycloak rejected it with `unauthorized_client`.

Captured token request (note: no `client_secret` field, no `Authorization` header):

```
POST .../realms/mohamy/protocol/openid-connect/token
redirect_uri=...&code=...&code_verifier=...&grant_type=authorization_code&client_id=web-app
```

**Fix:** pass the secret as a plain string argument, which `openid-client` converts to
`client_secret` and uses with `client_secret_post` authentication:

```ts
this.config = await client.discovery(new URL(issuer), clientId, clientSecret);
```

Verified end-to-end against the live Keycloak realm: a full browser-style flow as `testuser`
(exchange of a real authorization code) now returns **200** with a real access token + ID token
(`sub=b172d832-...`, `email=testuser@example.com`). Committed as `7e0f0774`.

## NOT yet verified — requires a human + real browser (explicit pending gap)

The following **cannot** be claimed as verified in this sandbox and remain **pending** a real
human browser round-trip with the API running on the user's PC at `http://localhost:3000`:

- **Final interactive login + callback round-trip** — `GET /auth/login` → redirect to Keycloak,
  real user consent, then `GET /auth/callback` exchanging a real authorization code for tokens
  through the actual Nest server (not the reproduction script above).
- **Live session-cookie round-trip** — creating an `AppSession` row in Neon, setting the HttpOnly
  session cookie, and exercising `/auth/me` (expect `{"userId": "b172d832-...", "activeTenantId": null}`),
  `/auth/csrf`, and `POST /auth/logout` end-to-end through the browser.
- **Cross-origin browser behavior** of the `SameSite=Lax` cookie and the CSRF Origin check across
  the real frontend origin (`http://localhost:5173`).

Because of this, the adapter + session logic is **unit/build/lint verified**, the Keycloak
**discovery** is **live-verified**, and the **code-exchange** fix is **verified via a reproduction
script**, but the **interactive browser grant is still pending** the human round-trip above.

## Baseline decision

The Keycloak OIDC adapter + session store compile, lint, and pass 42 unit tests; live Keycloak
discovery confirms the endpoints, PKCE/grant capabilities, and client auth methods the adapter
relies on; and the code-exchange step (the previous blocker) is fixed and verified against a real
Keycloak realm. The interactive browser Authorization-Code + PKCE flow and the session-cookie
round-trip are **not yet runtime-verified through the actual server** and are a documented,
explicit human step before production.
