# Phase 2 Authentication and Session Runtime Evidence

**Status:** Authentication/session runtime slice verified; broader Phase 2 remains open.

**Evidence date:** 2026-08-23

**Qualified environment:** Windows 11 with Docker Desktop, PostgreSQL, Redis, MinIO, and Keycloak 26.7.2 development services. This is development and verification evidence only, not production-readiness evidence.

## 1. Scope and evidence boundary

This record documents the successful end-to-end authentication/session verifier runs after the live Keycloak client `mohamy-api` was assigned the `basic` client scope as a Default scope. The `basic` scope’s Subject (`sub`) mapper was inspected and reported with **Add to access token = On**. The repository fixture was aligned in commit `41a454af`, the callback redirect contract was corrected and published in commit `8ca694d2`, and the separate negative-path verifier was published in commit `c943b2b2`.

The correction in `8ca694d2` adds an explicit validated `FRONTEND_ORIGIN` configuration value and resolves the already-allowlisted relative return path against that origin. It does not weaken JWT validation, add an alternate identity claim, bypass CSRF/origin checks, or change tenant security behavior.

The evidence below was supplied from the Windows runtime verifier output. No authorization codes, state values, session-state values, tokens, environment values, or debug-log contents are recorded here.

## 2. Runtime result

The verifier produced the following safe markers:

```text
auth_pkce_status=PASS|method=S256|state_nonce_present=true
auth_login_status=PASS|callback_validated=true|session_cookie_set=true
auth_session_status=PASS|authenticated=true|redacted=true
auth_csrf_status=PASS|token_length=43
auth_logout_status=PASS|revoked=true|post_logout_denied=true
auth_anonymous_status=PASS|session_denied=true
auth_runtime_result=PASS
```

The separate negative-path verifier subsequently produced the following safe markers:

```text
auth_negative_pkce_status=PASS|method=S256|state_nonce_present=true
auth_negative_state_mismatch_status=PASS|http=401
auth_negative_login_status=PASS|callback_validated=true|session_cookie_set=true
auth_negative_state_replay_status=PASS|http=401
auth_negative_session_status=PASS|authenticated=true|redacted=true
auth_negative_origin_missing_status=PASS|http=403
auth_negative_origin_disallowed_status=PASS|http=403
auth_negative_csrf_missing_status=PASS|http=403
auth_negative_csrf_mismatch_status=PASS|http=403
auth_negative_session_preserved_status=PASS|authenticated=true
auth_negative_logout_status=PASS|http=204|post_logout_denied=true
auth_negative_anonymous_status=PASS|http=401
auth_lifecycle_refresh_status=PASS|http=204|session_preserved=true
auth_lifecycle_refresh_repeat_status=PASS|http=204|session_preserved=true
auth_negative_runtime_result=PASS
```

The controlled provider-availability failure verifier produced the following safe markers after Keycloak was stopped only for the refresh request and then restored:

```text
auth_provider_failure_pkce_status=PASS|method=S256|state_nonce_present=true
auth_provider_failure_login_status=PASS|callback_validated=true|session_cookie_set=true
auth_provider_failure_session_status=PASS|authenticated=true|redacted=true
auth_provider_refresh_failure_setup_status=READY|manual_keycloak_stop_required=true
auth_provider_refresh_failure_status=PASS|http=401|cookie_cleared=true|session_revoked=true
auth_provider_failure_runtime_result=PASS
KEYCLOAK_RESTORE_STATUS=STARTED
```

This is qualified evidence for fail-closed behavior when the provider is unavailable during refresh. It is not evidence for a provider `invalid_grant` response.

The short-TTL expiry verifier produced the following safe markers using process-local TTL overrides (`SESSION_IDLE_TTL_SECONDS=2` and `SESSION_ABSOLUTE_TTL_SECONDS=5`), without changing the protected `.env` file:

```text
auth_expiry_config_status=READY|idle_wait_ms=3000|absolute_wait_ms=6000
auth_expiry_idle_setup_status=PASS|session_created=true
auth_expiry_idle_status=PASS|session_denied=true|refresh_denied=true
auth_expiry_absolute_setup_status=PASS|session_created=true
auth_expiry_absolute_status=PASS|session_denied=true|refresh_denied=true
auth_expiry_runtime_result=PASS
EXPIRY_API_ENV_RESTORE=PASS|temporary_ttl_overrides_cleared=true
```

This is qualified evidence that idle and absolute application-session expiry deny both normal session access and refresh. The normal runtime environment was restored after the attempt.

The runtime results demonstrate that the following sequence succeeded in the qualified Windows environment:

| Boundary | Evidence | Status |
|---|---|---|
| Authorization Code + PKCE setup | `method=S256` and `state_nonce_present=true` | PASS |
| OIDC callback and session-cookie issuance | `callback_validated=true` and `session_cookie_set=true` | PASS |
| Authenticated application session | `authenticated=true` and `redacted=true` | PASS |
| CSRF bootstrap | `token_length=43` | PASS |
| Logout and application-session revocation | `revoked=true` and `post_logout_denied=true` | PASS |
| Anonymous session denial | `session_denied=true` | PASS |
| State mismatch and replay rejection | `http=401` for both paths | PASS |
| Missing and disallowed origin rejection | `http=403` for both paths | PASS |
| Missing and mismatched CSRF rejection | `http=403` for both paths | PASS |
| Session preservation after rejected mutations | `authenticated=true` | PASS |
| Successful server-side session refresh | `http=204` and `session_preserved=true` | PASS |
| Repeated server-side refresh | `http=204` and `session_preserved=true` on the second refresh | PASS for exercised behavior |
| Provider unavailable during refresh | `http=401`, cookie cleared, and application session revoked | PASS for exercised behavior |
| Idle session expiry | Short-TTL session denied after inactivity and refresh denied | PASS for exercised behavior |
| Absolute session expiry | Short-TTL session denied after absolute deadline and refresh denied | PASS for exercised behavior |

## 3. Requirements traceability

| Requirement | Source | Implementation | Tests | Runtime evidence | Status |
|---|---|---|---|---|---|
| Authorization Code + PKCE with state, nonce, and S256 | [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md) and [`AUTHENTICATION_IMPLEMENTATION_PLAN.md`](AUTHENTICATION_IMPLEMENTATION_PLAN.md) | `backend/api/src/auth/auth.service.ts`, `backend/api/src/auth/oidc-transaction.store.ts`, `backend/api/src/auth/oidc.client.ts` | AuthService and transaction-store suites | `auth_pkce_status=PASS` | PASS for this runtime slice |
| Strict provider-token validation, including required subject | [`AUTHENTICATION_IMPLEMENTATION_PLAN.md`](AUTHENTICATION_IMPLEMENTATION_PLAN.md) | `backend/api/src/auth/oidc.client.ts` and fixed diagnostic classification in `backend/api/src/auth/auth.service.ts` | OIDC/AuthService regression coverage | Successful callback after live `basic` Subject mapper assignment; no subject-rejection warning in the supplied successful run | PASS for this runtime slice |
| Immutable provider-subject mapping | [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md) | `backend/api/src/auth/session.service.ts`, `ExternalIdentity` schema model | Session-service and AuthService coverage | Session creation completed; raw identity payload was not returned | PARTIAL; database identity persistence was not independently captured in this run |
| Opaque application session | [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md) | `backend/api/src/auth/session.service.ts`, `backend/api/src/auth/session-cookie.ts` | Session and cookie suites | Session cookie set; authenticated session returned redacted view | PASS for exercised behavior |
| CSRF token boundary | [`AUTHENTICATION_IMPLEMENTATION_PLAN.md`](AUTHENTICATION_IMPLEMENTATION_PLAN.md) | `backend/api/src/auth/session.service.ts`, CSRF/origin middleware, controller | CSRF/origin and session suites | Valid token bootstrap passed; missing and mismatched CSRF mutations returned HTTP 403 | PASS for exercised behavior; additional mutation cases remain |
| Logout revocation and anonymous denial | [`AUTHENTICATION_IMPLEMENTATION_PLAN.md`](AUTHENTICATION_IMPLEMENTATION_PLAN.md) | `backend/api/src/auth/auth.controller.ts`, `backend/api/src/auth/session.service.ts`, OIDC adapter | Session/AuthService suites | Logout, post-logout denial, and anonymous denial all passed | PASS for exercised behavior |
| Frontend-origin callback redirect | [`AUTHENTICATION_IMPLEMENTATION_PLAN.md`](AUTHENTICATION_IMPLEMENTATION_PLAN.md) | `FRONTEND_ORIGIN` validation and `AuthController.callback()` | `backend/api/src/auth/auth.controller.spec.ts`, environment-validation suite | `auth_login_status=PASS` after the redirect-contract correction | PASS for this runtime slice |

## 4. Static verification associated with the authentication/session runtime changes

The latest sandbox verification covered the refresh hardening, repeated-refresh verifier, provider-outage verifier, and short-TTL expiry verifier:

| Command | Result |
|---|---|
| `pnpm --filter api exec jest --runInBand` | PASS — 20 suites, 87 tests |
| `pnpm --filter api exec eslint src` | PASS |
| `pnpm --filter api run build` | PASS |
| `node --check backend/api/scripts/auth-runtime-check.mjs` | PASS |
| `node --check backend/api/scripts/auth-negative-runtime-check.mjs` | PASS |
| `node --check backend/api/scripts/auth-provider-failure-runtime-check.mjs` | PASS |
| `node --check backend/api/scripts/auth-expiry-runtime-check.mjs` | PASS |
| JSON validation for `backend/api/package.json` and `infrastructure/docker/keycloak/mohamy-realm.json` | PASS |
| `git diff --check` | PASS |

The refresh hardening and repeated-refresh verifier were published as commit `5573ea8f`. The controlled provider-outage verifier and Keycloak research note were published as commit `36de2090`. The explicit refresh-expiry guard was published as commit `330f5dca`, and the short-TTL expiry verifier was published as commit `58d55440`. `origin/main` was not modified.

## 5. Remaining Phase 2 work

This document closes only the demonstrated authentication/session runtime slice. It does not close Phase 2. The authoritative remaining work includes authorization and effective permissions, tenant membership and tenant switching, audit events, API envelopes and idempotency, abuse and identity-data lifecycle controls, frontend authentication state and tenant-aware UX, broader integration-test topology, and the remaining tenant-aware infrastructure integration requirements.

The following authentication-related evidence remains unverified or partial:

| Item | Status |
|---|---|
| CSRF rejection for missing and mismatched tokens | PASS in the negative-path Windows verifier; additional mutation cases remain |
| Exact-origin rejection for disallowed or missing browser origins on state-changing requests | PASS in the negative-path Windows verifier |
| OIDC state replay and state mismatch | PASS in the negative-path Windows verifier |
| Callback nonce mismatch and expired transaction runtime cases | Unit-tested or design-covered; real Windows runtime evidence not recorded here |
| Successful provider refresh | PASS in the lifecycle verifier; session cookie preserved |
| Refresh-token rotation persistence | Repeated refresh passed; encrypted-token replacement is covered by deterministic SessionService tests, but the live provider response was not inspected | PARTIAL |
| Provider unavailable during refresh | HTTP 401, cookie cleared, and application session revoked | PASS for exercised behavior |
| Provider `invalid_grant` refresh failure revocation | UNVERIFIED in this runtime run |
| Session idle and absolute expiry runtime behavior | PASS in the short-TTL Windows verifier; normal production-duration timing remains represented by configuration and unit behavior |
| Suspended/disabled/deleted user and membership gates | UNVERIFIED in this runtime run |
| Database-level persisted identity/session inspection | UNVERIFIED in this runtime run |
| Production Keycloak deployment, TLS, KMS-backed encryption, production object storage, and operational evidence | BLOCKED by the qualified development-only environment |

## 6. Security and production qualification

The successful runtime markers do not justify a production-readiness claim. The current evidence is limited to Windows 11 plus Docker Desktop with Keycloak `start-dev` and development storage settings. The future supported Linux deployment with production-grade TLS, KMS-backed key management, production object storage, secure cookie configuration, operational controls, and full integration evidence remains required.

No alternate claim was accepted for the provider subject. The API continues to require a non-empty standard `sub` claim and maps identity only through `(provider, subject)`. The runtime correction addressed the missing `basic` client-scope assignment and the separate frontend redirect-contract defect; it did not bypass authentication or authorization controls.

## 7. Qualified completion statement

**Authentication/session runtime slice:** PASS in the qualified Windows development environment, based on the supplied verifier markers and the published implementation.

**Phase 2 overall:** OPEN and not complete.

**Production readiness:** NOT ESTABLISHED.

**Phase 3:** Not started.

## 8. External protocol evidence

The subject-claim diagnosis was cross-checked against the OpenID Connect and Keycloak documentation. OpenID Connect Core defines `sub` as a required ID Token claim and describes it as a locally unique, never-reassigned subject identifier intended for the client [1]. Keycloak’s release notes explain that, in the lightweight-access-token changes, `sub` is supplied by protocol mappers and remains present in regular access tokens but may be absent from lightweight access tokens unless configured for that token profile [2]. This supports the project decision to retain a mandatory standard `sub` claim and to correct client-scope/token-profile configuration rather than substitute another claim.

[1]: https://openid.net/specs/openid-connect-core-1_0.html "OpenID Connect Core 1.0 incorporating errata set 2"
[2]: https://www.keycloak.org/2024/06/keycloak-2500-released "Keycloak 25.0.0 release notes"

## 9. Current qualified status

The happy-path, negative-path, successful server-side refresh, repeated-refresh, provider-unavailability fail-closed, and short-TTL idle/absolute-expiry authentication/session verifiers are PASS in the qualified Windows development environment. Provider `invalid_grant` refresh failure, user and membership state transitions, provider logout events, MFA assurance, database persistence inspection, and broader Phase 2 workstreams remain unverified or open. Phase 3 has not started, and production readiness is not established.
