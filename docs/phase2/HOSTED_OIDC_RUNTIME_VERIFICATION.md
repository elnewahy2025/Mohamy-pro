# Phase 2 Hosted OIDC + Session Verification

**Date:** 2026-08-28

**Repository revision:** current working tree of `Mohamy-Backup` (elnewahy2025/Mohamy-Backup).

**Environment:** Linux sandbox (Node v22.16.0, pnpm 11.22.0). Work is executed entirely online. OIDC provider is **hosted Logto Cloud** (`https://xewb3h.logto.app/`). This build closed the "auth: build Logto OIDC adapter + sessions" condition from the Phase 2 plan.

## Purpose

Implement and verify the auth groundwork for Phase 2 identity + multi-tenancy: a hosted-Logto OIDC (OpenID Connect) adapter (Authorization Code + PKCE S256) and a server-side session store (opaque HttpOnly session cookie backed by the `AppSession` table in Neon), plus the OIDC interaction cookie and CSRF protection. Clearly separate what was **actually verified at runtime in this sandbox** from what **requires a human browser round-trip** and therefore cannot be claimed as verified here.

## What is implemented (source under `backend/api/src/auth/`)

- **`oidc/oidc-provider.service.ts`** — Logto OIDC client built on `openid-client@6.8.7`: dynamic provider discovery, Authorization Code flow with **PKCE S256** (confirmed supported by Logto discovery), `expectedState`/`expectedNonce` correlation, refresh-token grant, RFC 7009 token revocation, end-session URL, and ID-token claims→`OidcProfile` mapping.
- **`identity.service.ts`** — resolves the OIDC `subject` to a local `User` via `ExternalIdentity` (compound unique `provider_subject`), creating/linking a user (PENDING) in a Neon transaction when first seen (email-normalized reuse).
- **`session/session-crypto.ts`** — pure `node:crypto`: opaque token generation, SHA-256 token hashing, constant-time compare, and AES-256-GCM encryption (key derived via HKDF-SHA256 from `SESSION_SECRET`) for the encrypted provider refresh token and the OIDC interaction payload (`v1.iv.tag.ciphertext`). No hand-rolled crypto.
- **`session/session-cookie.service.ts`** — HttpOnly `SameSite=Lax` session cookie (`SESSION_COOKIE_NAME`, default `mohamy_session`, secure in production) plus the 15-minute `mohamy_oidc` interaction cookie that carries the encrypted `{state, nonce, codeVerifier}` across the redirect.
- **`session/session.service.ts`** — `AppSession` lifecycle: create (hashes token + CSRF token, encrypts refresh token, idle + absolute TTLs), validate (status, idle/absolute expiry→EXPIRED, user permitted, bump `lastUsedAt`), revoke, refresh-token read/rotate (`getRefreshToken`/`rotateRefreshToken`), active-tenant switch (`updateActiveTenant`, bumps `contextVersion`), and CSRF issue/verify (constant-time hash compare).
- **`session/session.guard.ts` / `session/csrf.guard.ts`** — guards: `SessionGuard` attaches `request.auth` from the session cookie; `CsrfGuard` enforces Origin ∈ `CORS_ORIGINS` + `X-CSRF-Token` on `POST/PUT/PATCH/DELETE`.
- **`auth.service.ts` / `auth.controller.ts` / `auth.module.ts`** — routes `GET /api/v1/auth/login`, `/auth/callback`, `/auth/csrf` (Session+Csrf guarded), `/auth/me` (Session guarded), `POST /auth/logout`.
- **`config/env.validation.ts`** — new `OIDC_*` / `SESSION_*` settings; **fail-closed in production** (requires `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `SESSION_SECRET` ≥ 32 chars, `SESSION_SECURE_COOKIE=true`); dev/test get safe defaults so the worker process and test suite still boot.

## Verified in this sandbox (evidence above is cross-checked live where possible)

1. **Build clean:** `nest build` → `exit 0`, 0 TS errors.
2. **Lint clean:** `eslint` on all auth files + the changed config file → `exit 0`, 0 errors (only the standard `no-unsafe-*` warnings from `as any` mock objects, consistent with existing specs like `idempotency.service.spec.ts`).
3. **49 unit tests pass** (7 suites): `session-crypto`, `session.service` (lifecycle/expiry/revoke/CSRF/tenant-switch/refresh), `session.guard`, `csrf.guard`, `identity.service`, `oidc-provider.service` (discovery/config/exchange/refresh/revoke/logout-url), and `env.validation`. Full repo suite green as well.

   ```text
   Test Suites: 7 passed, 7 total
   Tests:       49 passed, 49 total
   ```

4. **Live Logto discovery re-probed** against `https://xewb3h.logto.app/oidc/.well-known/openid-configuration` (public metadata only, no secrets):

   ```json
   {
     "issuer": "https://xewb3h.logto.app/oidc",
     "authorization_endpoint": "https://xewb3h.logto.app/oidc/auth",
     "token_endpoint": "https://xewb3h.logto.app/oidc/token",
     "userinfo_endpoint": "https://xewb3h.logto.app/oidc/me",
     "jwks_uri": "https://xewb3h.logto.app/oidc/jwks",
     "end_session_endpoint": "https://xewb3h.logto.app/oidc/session/end",
     "revocation_endpoint": "https://xewb3h.logto.app/oidc/token/revocation",
     "code_challenge_methods_supported": ["S256"],
     "grant_types_supported": ["implicit","authorization_code","refresh_token","client_credentials", ...],
     "id_token_signing_alg_values_supported": ["ES384"]
   }
   ```

   Confirms: `authorization_code` + `refresh_token` grants, PKCE `S256`, `offline_access` scope support, revocation and end-session endpoints exist. These are the exact endpoints the adapter uses.

5. **Secrets safe:** the credential-bearing file `backend/api/.env` is **gitignored** (confirmed `.env` entry in `.gitignore`); the current working tree shows only the expected source changes and no `.env` commit. OIDC client id/secret and the redirect URI are not present in any tracked file.

## NOT verified here — requires a human + real court (explicit gap)

The following **cannot** be verified in this browser-less sandbox and are **not** claimed as verified. A real user with a browser, running the API at `http://localhost:3000`, must complete these before the auth flow is production-ready:

- **Authorizing with a real Logto end user** — the interactive login (`GET /auth/login` → redirect to Logto, user consent) and the **callback round-trip** (`GET /auth/callback`) exchanging a real authorization code for tokens. This requires:
  - the redirect URI **`http://localhost:3000/api/v1/auth/callback` registered in the Logto application's Redirect URIs** (dev-assumed; must be confirmed/added there), and
  - a real test user + password/consent in the Logto Cloud tenant.
- **Live token exchange + session-cookie round-trip** — creating an `AppSession` row in Neon, setting the HttpOnly session cookie, and exercising `/auth/me` / `/auth/csrf` / `POST /auth/logout` end-to-end through the browser.
- **Cross-origin browser behavior** of the `SameSite=Lax` cookie and the CSRF Origin check across the actual frontend origin (`http://localhost:5173`).

Because of this, the adapter + session logic is **unit/build/lint verified**, and the Logto **discovery** is **live-verified**, but the **interactive grant is unverified** until the human round-trip above is performed.

## Frontend note

`next build` for the frontend still fails on a pre-existing Turbopack `Invalid symlink` error resolving `@mohamy/contracts`; that is unchanged by this workstream and tracked separately.

## Baseline decision

The hosted Logto OIDC adapter + session store compile, lint, and pass 49 unit tests, and the live Logto discovery confirms the endpoints and PKCE/grant capabilities the adapter relies on. The interactive Authorization-Code + PKCE flow and the session-cookie round-trip are **not yet runtime-verified** (browser + registered redirect URI required); they are a documented, explicit human step before production.
