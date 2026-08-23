# Mohamy Pro Phase 2 — Latest Status Relay for Gemini

## Copy-ready context

You are assisting with the **Mohamy Pro Phase 2 authentication/session/OIDC workstream**. You do not have direct access to the user’s Windows checkout, running terminals, Docker containers, local `.env`, or GitHub working tree. The user will relay your questions and outputs to the repository agent, which can inspect the selected repository and prepare exact actions. Do not ask the user to expose secrets or to claim that you directly inspected their repository.

Work only on the public branch `phase2/legacy-tenant-boundaries`. Do not touch `origin/main`. The repository’s authoritative Phase 2 plan is `docs/phase2/PHASE2_IMPLEMENTATION_PLAN.md`. Read `skills/engineering-governance/SKILL.md` and the authentication decision documents before proposing changes. Do not begin Phase 3 and do not claim Phase 2 complete or production-ready.

## Current branch and synchronization state

The latest published branch head is `9b8b076b`, with commit message `chore(phase2): classify jwt validation failures`. The Windows checkout has been synchronized to that commit. The synchronization passed with pnpm 11.22.0, frozen installation, Prisma client generation, Prisma migration deployment, and API build. The database reported eight migrations and no pending migrations.

The Windows checkout still contains these protected local items and they must remain unchanged:

| Path | Required treatment |
|---|---|
| `backend/api/scripts/auth-runtime-check.mjs` | Modified local verifier; preserve exactly unless the user explicitly approves a targeted edit. |
| `backend/api/auth-runtime-debug.log` | Untracked local debug log; preserve exactly and do not print its contents. |
| `infrastructure/docker/docker-compose.yml` | User’s protected local modification; preserve exactly. |
| `ENGINEERING_BACKLOG.zip` | Protected untracked file; preserve exactly. |
| `Prompt for External AI — Mohamy Pro Phase 1 Migration Reconciliation.md` | Protected untracked file; preserve exactly. |
| `docs/phase1/FRESH_DATABASE_MERGE_RECOVERY.md` | Protected untracked file; preserve exactly. |

Before any synchronization, run `git status --short` from the actual repository root. Never reset, restore, stash, delete, overwrite, or recreate local work without explicit approval. Use pnpm 11.22.0 only. Do not use npm, npx, yarn, or ad hoc package-manager commands.

## Windows development topology

Windows 11 with Docker Desktop is the qualified development/verification plane. The four Mohamy containers are configured with Docker restart policy `unless-stopped`:

| Component | Expected role |
|---|---|
| `docker-postgres-1` | Existing PostgreSQL database |
| `docker-redis-1` | Redis for PKCE transaction storage and queues |
| `docker-minio-1` | Local object storage required by API startup |
| `docker-keycloak-1` | Keycloak 26.7.2 development realm and OIDC provider |
| API host process | `pnpm --filter api run start:prod`, port 3000 |
| Worker host process | `pnpm --filter api run start:worker`, port 3002 |

Do not quit Docker Desktop if it also hosts protected Health-ERP, Vision-ERP, or unrelated services. Do not run `docker compose down`. The Keycloak `start-dev` container and this entire Windows topology are development evidence only, not production evidence.

## Proven authentication configuration

These non-secret values have been verified:

| Setting | Verified value |
|---|---|
| API route contract | `/api/v1/auth/*` |
| `OIDC_ISSUER_URL` | `http://127.0.0.1:58080/realms/mohamy` |
| `OIDC_CLIENT_ID` | `mohamy-api` |
| `OIDC_AUDIENCE` | `mohamy-api` |
| `OIDC_REDIRECT_URI` | `http://127.0.0.1:3000/api/v1/auth/callback` |
| `OIDC_SCOPES` | `openid profile email` |
| Verifier origin | `http://localhost:5173` |

The local `OIDC_CLIENT_SECRET`, `SESSION_ENCRYPTION_KEY`, `DATABASE_URL`, refresh tokens, access tokens, ID tokens, authorization codes, PKCE verifiers, session cookies, CSRF secrets, Redis values, and admin tokens must never be printed or relayed.

## What has been proven

A direct Windows request to `GET /api/v1/auth/login?returnTo=%2Far` returned HTTP 302. The unversioned comparison `/api/auth/login?returnTo=%2Far` returned HTTP 404. The correct 302 redirect contained the expected Authorization Code + PKCE parameter names, including `state`, `nonce`, `code_challenge`, and `code_challenge_method=S256`.

The API has repeatedly started successfully with PostgreSQL, Redis, queue, and object-storage readiness. The worker has repeatedly started successfully with PostgreSQL, Redis, queue, and `OutboxWorker` readiness. Keycloak discovery has repeatedly returned HTTP 200 on IPv4 loopback.

The active Keycloak client has been inspected through the development admin API. It is a single confidential client with standard flow enabled, exact redirect URI `http://127.0.0.1:3000/api/v1/auth/callback`, and PKCE S256. The local client secret was compared with the checked-in fixture without printing either value, and the comparison passed. The active container secret was also compared with the fixture without printing it, and the comparison passed.

The live authorization redirect was decoded without printing its state or nonce. Its scope was exactly `openid profile email`. The active client’s direct default scopes were later verified as `profile,email`. The active realm-level default scopes were verified as `role_list,saml_organization,AuthnContextClassRef,profile,email,roles,web-origins,acr,basic`. The active realm-level optional scopes included `offline_access,address,phone,microprofile-jwt,organization`; `offline_access` was not a realm-level default.

The stale development Keycloak state was refreshed once with a Keycloak-only `--no-deps --force-recreate`. After that refresh, a corrected tokenized scope check reported active client default scopes `profile,email` and no `offline_access`.

The repository contains an opaque server-side session design, encrypted refresh-token and CSRF-secret storage, one-time Redis-backed PKCE transaction storage, strict JWT issuer/audience/algorithm/claim checks, exact-origin and CSRF middleware, and login/callback/session/csrf/logout endpoints. Static verification of the relevant source has passed repeatedly. The latest diagnostic source commit adds an allowlisted validation-reason classifier and a regression test; it does not relax any authentication check.

## Current unresolved runtime failure

The latest confirmed runtime flow is not complete. The verifier prints:

`auth_pkce_status=PASS|method=S256|state_nonce_present=true`

and then fails with:

`auth_runtime_result=FAIL|error=OIDC callback returned HTTP 401`

An earlier API log from before the final JWT diagnostic showed that the callback reached `/api/v1/auth/callback`, the Keycloak token exchange returned HTTP 200-equivalent success because no exchange-rejection log appeared, and the API then rejected the access token during `access_token_validation`. That older log showed only `OIDC callback rejected during access_token_validation|error=Error`; it did not prove the exact JWT-library cause. A prior, older run before the development Keycloak state was refreshed showed Keycloak token endpoint HTTP 400 with `provider_error=not_allowed` and `provider_reason=offline_token_not_allowed`. That older provider failure must not be attributed automatically to the latest run.

The currently synchronized diagnostic build at `9b8b076b` adds this safe log format for validation failures:

`OIDC callback rejected during access_token_validation|reason=<allowlisted-reason>|error=<error-class>`

The allowlisted reason values are `audience_mismatch`, `issuer_mismatch`, `nonce_mismatch`, `signature_or_key_rejected`, `temporal_claim_rejected`, and `jwt_validation_rejected`. No raw JWT-library error message, token, or response body is logged. **A fresh verifier attempt has not yet supplied the corresponding latest API diagnostic line from the `9b8b076b` process.** Do not claim that the audience hypothesis is proven until that line is captured.

## Current best next action

Use the already synchronized `9b8b076b` source on Windows. Start the API and worker only after confirming both ports are free, then run exactly one verifier attempt. Capture the complete verifier output and only the corresponding sanitized API line from the same attempt. The relevant line must be one of the following forms:

`OIDC callback rejected during access_token_validation|reason=audience_mismatch|error=Error`

`OIDC callback rejected during access_token_validation|reason=issuer_mismatch|error=Error`

`OIDC callback rejected during access_token_validation|reason=nonce_mismatch|error=Error`

`OIDC callback rejected during access_token_validation|reason=signature_or_key_rejected|error=Error`

`OIDC callback rejected during access_token_validation|reason=temporal_claim_rejected|error=Error`

`OIDC callback rejected during access_token_validation|reason=jwt_validation_rejected|error=Error`

Do not change `OIDC_AUDIENCE`, issuer validation, redirect URI, PKCE, scopes, Keycloak roles, database schema, or migrations before that exact line is reviewed. If it reports `audience_mismatch`, inspect the actual Keycloak access-token `aud` claim through a sanitized, no-token diagnostic or a controlled local decode of the token’s non-sensitive claim names/values, then decide whether the Keycloak client needs an audience mapper or whether the configured API audience is wrong. Do not simply remove the audience check.

If the reason is `issuer_mismatch`, compare the access-token issuer with the configured issuer and discovery issuer without changing validation to accept multiple issuers. If it is `signature_or_key_rejected`, verify the discovery JWKS URI and active Keycloak signing algorithm while retaining RS256 enforcement. If it is `temporal_claim_rejected`, inspect the development container and Windows clock boundary without increasing clock tolerance beyond the approved decision. If it is `nonce_mismatch`, keep ID-token nonce validation strict and trace only the stored nonce flow. If the reason is generic, add a more precise allowlisted classifier rather than logging arbitrary native messages.

Add a regression test for the proven cause, rerun the complete static gates, synchronize with a clean non-destructive process, and rerun the real Windows flow. The full accepted authentication evidence must include callback/session creation, encrypted refresh-token behavior, CSRF issuance, wrong-origin and wrong-CSRF denial, logout revocation, post-logout denial, state replay denial, refresh failure handling, and anonymous denial. The authentication evidence must be documented under `docs/phase2/` before calling the authentication slice complete.

## Commands and safety rules

Every Windows PowerShell block must begin with:

`Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'`

Before synchronization, show `git status --short`. Before starting or stopping a process, state which terminal is used and whether API, worker, and Keycloak should be running or stopped. Never use `exit`, `exit 0`, self-closing scripts, complex quoted regular expressions, custom Unicode filename parsers, or unreviewed process-killing scripts. Use small blocks that return to the PowerShell prompt.

Never paste PowerShell output back as a command. Never print or transmit `.env` values, passwords, secrets, tokens, cookies, authorization codes, PKCE verifiers, database URLs, or raw provider response bodies. Never reset, restore, stash, delete, overwrite, or recreate protected local files or the user’s existing database. Never claim a runtime result that has not been directly observed.

## Relevant repository documents

The previously published handoff prompt is `docs/phase2/OIDC_CALLBACK_FAILURE_HANDOFF_PROMPT.md`. The latest branch state and this relay are in `docs/phase2/GEMINI_LATEST_STATUS_RELAY.md`. The authoritative implementation plan is `docs/phase2/PHASE2_IMPLEMENTATION_PLAN.md`. The authentication architectural decisions are in `docs/phase2/AUTHENTICATION_ARCHITECTURE_DECISION.md`, `docs/phase2/ACCOUNT_LIFECYCLE_DECISION.md`, and `docs/phase2/TENANT_MEMBERSHIP_SWITCHING_DECISION.md`.

## References

[1]: https://www.keycloak.org/securing-apps/oidc-layers "Keycloak OIDC layers"

[2]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/TokenManager.java "Keycloak TokenManager.java"

[3]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/services/managers/UserSessionManager.java "Keycloak UserSessionManager.java"

[4]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/OIDCLoginProtocol.java "Keycloak OIDCLoginProtocol.java"

[5]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/grants/AuthorizationCodeGrantType.java "Keycloak AuthorizationCodeGrantType.java"

[6]: https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/services/util/DefaultClientSessionContext.java "Keycloak DefaultClientSessionContext.java"

[7]: https://www.keycloak.org/docs-api/latest/javadocs/org/keycloak/models/ClientSessionContext.html "Keycloak ClientSessionContext API"
