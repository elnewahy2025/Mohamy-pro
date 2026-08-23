# Mohamy Pro Phase 2: OIDC Callback Failure Handoff Prompt

## Purpose

Use this prompt with another senior AI or engineer to continue the **Phase 2 authentication/session/OIDC workstream** on the public branch `phase2/legacy-tenant-boundaries`. The purpose is to diagnose and correct the remaining Windows development failure without weakening authentication, introducing a workaround disguised as a fix, modifying protected local work, or claiming Phase 2 completion before the required evidence passes.

## Prompt to the next AI

You are taking over a NestJS 11 / Prisma 7 / PostgreSQL 16 / Redis 7 / Keycloak 26.7.2 monorepo called **Mohamy Pro**. Work only on the public branch `phase2/legacy-tenant-boundaries`; do not touch `origin/main`. The repository’s authoritative Phase 2 plan is `docs/phase2/PHASE2_IMPLEMENTATION_PLAN.md`. Read that plan, the authentication decisions, the authentication implementation plan, and `skills/engineering-governance/SKILL.md` before changing anything.

The active workstream is the dependency-first authentication/session/OIDC foundation: Keycloak Authorization Code + PKCE, opaque server-side sessions, encrypted refresh tokens, CSRF and exact-origin controls, and qualified Windows runtime verification. Phase 3 must not begin, and Phase 2 must not be declared complete or production-ready.

### Repository and branch state

The latest published branch head is `56d8f3d4` (`chore(phase2): classify oidc rejection reasons`). The branch is separate from `origin/main`. The Windows checkout has these known protected local items, which must remain unchanged:

| Path | Required treatment |
|---|---|
| `infrastructure/docker/docker-compose.yml` | Preserve the user’s local modification exactly. |
| `ENGINEERING_BACKLOG.zip` | Preserve the untracked file exactly. |
| `Prompt for External AI — Mohamy Pro Phase 1 Migration Reconciliation.md` | Preserve the untracked file exactly. |
| `docs/phase1/FRESH_DATABASE_MERGE_RECOVERY.md` | Preserve the untracked file exactly. |

Before every synchronization, run `git status --short` from the actual repository root. Never reset, restore, stash, delete, overwrite, or recreate local work without explicit approval. Use only pnpm 11.22.0; do not substitute npm, npx, yarn, or ad hoc package-manager commands. After synchronization, run `pnpm install --frozen-lockfile`, `pnpm --filter api exec prisma generate`, and `pnpm --filter api exec prisma migrate deploy`.

### Current Windows runtime topology

Windows 11 with Docker Desktop is the qualified development/verification plane. The four Mohamy containers are currently configured outside the repository with Docker restart policy `unless-stopped`:

| Component | Current state |
|---|---|
| `docker-postgres-1` | Running, `unless-stopped` |
| `docker-redis-1` | Running, `unless-stopped` |
| `docker-minio-1` | Running, `unless-stopped` |
| `docker-keycloak-1` | Running, `unless-stopped`, development-only Keycloak 26.7.2 |
| API host process | Started from `pnpm --filter api run start:prod`, port 3000 |
| Worker host process | Started from `pnpm --filter api run start:worker`, port 3002 |

Do not quit Docker Desktop if it also hosts protected Health-ERP, Vision-ERP, or unrelated services. Do not run `docker compose down`. Do not recreate any service other than the isolated Keycloak container when a specific diagnostic proves it is necessary. The development Keycloak container is not production evidence.

### Proven local authentication configuration

The active API configuration uses these non-secret values:

| Setting | Verified value |
|---|---|
| `OIDC_ISSUER_URL` | `http://127.0.0.1:58080/realms/mohamy` |
| `OIDC_CLIENT_ID` | `mohamy-api` |
| `OIDC_AUDIENCE` | `mohamy-api` |
| `OIDC_REDIRECT_URI` | `http://127.0.0.1:3000/api/v1/auth/callback` |
| `OIDC_SCOPES` | `openid profile email` |
| API route contract | `/api/v1/auth/*` |
| Frontend origin used by verifier | `http://localhost:5173` |

Never print or request the value of `OIDC_CLIENT_SECRET`, `SESSION_ENCRYPTION_KEY`, `DATABASE_URL`, refresh tokens, access tokens, ID tokens, authorization codes, PKCE verifiers, session cookies, CSRF secrets, or Redis transaction values.

### What is proven

The direct Windows endpoint check returned `HTTP 302` for `GET http://127.0.0.1:3000/api/v1/auth/login?returnTo=%2Far` and returned `HTTP 404` for the unversioned comparison `/api/auth/login`. The redirect contained the expected authorization-code and PKCE parameter names: `client_id`, `response_type`, `scope`, `redirect_uri`, `state`, `nonce`, `code_challenge`, and `code_challenge_method`. A later direct live-scope check decoded the authorization redirect and reported exactly `openid profile email`.

The API and worker repeatedly started successfully with PostgreSQL, Redis, queue, and object-storage readiness. The Keycloak discovery endpoint repeatedly returned HTTP 200 on IPv4 loopback. The active Keycloak client was verified as one confidential client with standard flow enabled, exact redirect URI `http://127.0.0.1:3000/api/v1/auth/callback`, and PKCE method `S256`. The local client secret was compared to the checked-in development fixture without printing either value, and the comparison passed. A later active-client query also confirmed the active client secret matched the fixture without exposing it.

The checked-in realm fixture no longer assigns `offline_access` to the client’s direct default scopes. After a Keycloak-only refresh using `--no-deps --force-recreate`, the active client direct default scopes were reported as `profile,email`. The active realm-level default scopes were reported as `role_list,saml_organization,AuthnContextClassRef,profile,email,roles,web-origins,acr,basic`; the realm-level optional scopes included `offline_access,address,phone,microprofile-jwt,organization`. Thus `offline_access` is optional, not realm-default, in the active realm state that was inspected.

The repository implementation has safe diagnostics in `backend/api/src/auth/oidc.client.ts` and `backend/api/src/auth/auth.service.ts`. The verifier reports `auth_pkce_status=PASS|method=S256|state_nonce_present=true` before the callback. The callback reaches `/api/v1/auth/callback`. A captured API log from an earlier run on the diagnostic build reported `OIDC token exchange rejected with HTTP 400|provider_error=not_allowed|provider_reason=offline_token_not_allowed`, followed by `OIDC callback rejected during token_exchange|error=Error`. The latest verifier attempts after the live-scope and active-realm checks still returned `auth_runtime_result=FAIL|error=OIDC callback returned HTTP 401`, but the corresponding latest API log line was not supplied, so the current provider reason must not be assumed to be identical to the earlier one.

A Keycloak source trace established the following behavior. `AuthorizationCodeGrantType` rebuilds the `ClientSessionContext` from the scope stored in the authorization code. `DefaultClientSessionContext.isOfflineTokenRequested()` checks whether the realm `offline_access` client-scope ID is in the effective requested-scope set. `TokenManager.createOrUpdateOfflineSession()` rejects with `NOT_ALLOWED` when the offline-access role is not present in effective client-session roles. These facts come from the upstream sources listed in the References section.

### What is not proven

The full end-to-end authentication flow has **not** passed. No valid application session has been proven from the verifier after callback. Session endpoint, encrypted refresh-token persistence, CSRF-token endpoint, logout revocation, post-logout denial, and anonymous-session denial remain unverified by this runtime workstream.

The current exact reason for the latest API HTTP 401 is not proven because the latest API log corresponding to the latest verifier attempt was not captured. The prior `offline_token_not_allowed` classification came from an earlier run and must not automatically be attributed to the latest run after Keycloak state was refreshed. The Keycloak event query returned zero events in the current development realm, so it cannot be used as the authoritative latest-run diagnostic.

The Windows runtime is qualified development evidence only. No production KMS, Linux object-storage, production Keycloak, production TLS, production secret-management, or production deployment claim is permitted.

### Required next investigation

Do not modify the API, scope configuration, issuer, audience, redirect URI, PKCE method, database schema, or migrations until the current exact provider reason is captured. Use the already-running API, worker, and Keycloak processes and perform one verifier attempt. In the API terminal, capture only the single safe diagnostic line emitted by the current process:

`OIDC token exchange rejected with HTTP ...|provider_error=...|provider_reason=...`

Do not copy request URLs, query strings, response bodies, codes, tokens, cookies, or credentials. If the API emits no token-exchange diagnostic for that exact attempt, capture only the safe `OIDC callback rejected during ...` phase line. That absence would move the investigation back to the pre-token-exchange transaction path; otherwise, stay focused on the provider exchange.

If the current provider reason is again `offline_token_not_allowed`, instrument a development-only, sanitized diagnostic of the authorization-code exchange inputs and the Keycloak-issued code metadata path without printing values. Specifically verify whether the API’s exchange request is sending a `scope` field, whether Keycloak’s stored authorization-code scope contains `offline_access`, and whether the active client session is being resolved with realm default scopes different from the admin REST view. Do not grant the runtime user the offline-access role and do not request `offline_access` as a workaround, because that would alter the security semantics and produce an offline token rather than an ordinary online refresh token.

If the current provider reason is `invalid_grant`, distinguish the exact cause using a sanitized classification: code already consumed, code expired, redirect URI mismatch, client mismatch, PKCE verifier mismatch, session inactive, or consent unavailable. Review the verifier’s `CookieJar` and the API’s Redis transaction lifecycle only if the phase log or provider classification supports that path. The verifier uses an in-memory cookie jar and follows the Keycloak HTML login form; this behavior should be tested, not presumed.

If the current provider reason is `invalid_client`, verify the active Keycloak client secret against the local API configuration without printing either value. If it is a redirect or PKCE rejection, compare the values by hash or boolean equality only. Do not relax issuer, audience, redirect, PKCE, or client authentication checks.

Once a root cause is proven, make the smallest production-quality correction, add a regression test that reproduces the failure, rerun the complete static gates, and rerun the real Windows flow. The accepted end-to-end result requires, at minimum, PKCE initiation, callback validation, session creation, CSRF issuance, logout revocation, post-logout denial, and anonymous denial. Add negative-path checks for wrong origin/CSRF, state replay, and revoked session before claiming this authentication slice verified.

### Verification gates after any source change

Run the gates from the actual repository root with API and worker stopped where required by the command:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
pnpm install --frozen-lockfile
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate deploy
pnpm --filter api run build
pnpm --filter api exec eslint src
pnpm --filter api exec jest --runInBand
node backend/api/scripts/check-migrations.mjs
node --check backend/api/scripts/auth-runtime-check.mjs
git diff --check
```

Do not use a temporary copy or a different package manager as a substitute for the required repository checks. If a database-dependent check cannot run in the sandbox, report that limitation and use the qualified Windows database result; never fabricate a result.

### Completion boundary

Do not create a final authentication evidence document or claim Phase 2 complete until the current root cause is corrected, the real Windows verifier passes through callback/session/CSRF/logout/anonymous paths, negative security paths are verified, the static gates pass, the final diff is reviewed, and the evidence is documented under `docs/phase2/`. Even then, record the Windows/Docker/Keycloak development boundary and the remaining production Linux KMS/object-storage gate.

## References

[1]: https://www.keycloak.org/securing-apps/oidc-layers "Keycloak OIDC layers"

[2]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/TokenManager.java "Keycloak TokenManager.java"

[3]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/services/managers/UserSessionManager.java "Keycloak UserSessionManager.java"

[4]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/OIDCLoginProtocol.java "Keycloak OIDCLoginProtocol.java"

[5]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/grants/AuthorizationCodeGrantType.java "Keycloak AuthorizationCodeGrantType.java"

[6]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/services/util/DefaultClientSessionContext.java "Keycloak DefaultClientSessionContext.java"

[7]: https://www.keycloak.org/docs-api/latest/javadocs/org/keycloak/models/ClientSessionContext.html "Keycloak ClientSessionContext API"

[8]: https://github.com/keycloak/keycloak/issues/27878 "Keycloak offline token not allowed issue"

[9]: https://stackoverflow.com/questions/74796180/keycloak-bad-token-response-error-not-allowed-when-user-doesnt-have-the-offlin "Keycloak offline token not allowed example"
