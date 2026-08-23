# Phase 2 Authentication and Session Runtime Evidence

**Status:** Authentication/session runtime slice verified; broader Phase 2 remains open.

**Evidence date:** 2026-08-23

**Qualified environment:** Windows 11 with Docker Desktop, PostgreSQL, Redis, MinIO, and Keycloak 26.7.2 development services. This is development and verification evidence only, not production-readiness evidence.

## 1. Scope and evidence boundary

This record documents the successful end-to-end authentication/session verifier run after the live Keycloak client `mohamy-api` was assigned the `basic` client scope as a Default scope. The `basic` scope’s Subject (`sub`) mapper was inspected and reported with **Add to access token = On**. The repository fixture was aligned in commit `41a454af`, and the callback redirect contract was corrected and published in commit `8ca694d2`.

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

The runtime result demonstrates that the following sequence succeeded in the qualified Windows environment:

| Boundary | Evidence | Status |
|---|---|---|
| Authorization Code + PKCE setup | `method=S256` and `state_nonce_present=true` | PASS |
| OIDC callback and session-cookie issuance | `callback_validated=true` and `session_cookie_set=true` | PASS |
| Authenticated application session | `authenticated=true` and `redacted=true` | PASS |
| CSRF bootstrap | `token_length=43` | PASS |
| Logout and application-session revocation | `revoked=true` and `post_logout_denied=true` | PASS |
| Anonymous session denial | `session_denied=true` | PASS |

## 3. Requirements traceability

| Requirement | Source | Implementation | Tests | Runtime evidence | Status |
|---|---|---|---|---|---|
| Authorization Code + PKCE with state, nonce, and S256 | [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md) and [`AUTHENTICATION_IMPLEMENTATION_PLAN.md`](AUTHENTICATION_IMPLEMENTATION_PLAN.md) | `backend/api/src/auth/auth.service.ts`, `backend/api/src/auth/oidc-transaction.store.ts`, `backend/api/src/auth/oidc.client.ts` | AuthService and transaction-store suites | `auth_pkce_status=PASS` | PASS for this runtime slice |
| Strict provider-token validation, including required subject | [`AUTHENTICATION_IMPLEMENTATION_PLAN.md`](AUTHENTICATION_IMPLEMENTATION_PLAN.md) | `backend/api/src/auth/oidc.client.ts` and fixed diagnostic classification in `backend/api/src/auth/auth.service.ts` | OIDC/AuthService regression coverage | Successful callback after live `basic` Subject mapper assignment; no subject-rejection warning in the supplied successful run | PASS for this runtime slice |
| Immutable provider-subject mapping | [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md) | `backend/api/src/auth/session.service.ts`, `ExternalIdentity` schema model | Session-service and AuthService coverage | Session creation completed; raw identity payload was not returned | PARTIAL; database identity persistence was not independently captured in this run |
| Opaque application session | [`AUTHENTICATION_ARCHITECTURE_DECISION.md`](AUTHENTICATION_ARCHITECTURE_DECISION.md) | `backend/api/src/auth/session.service.ts`, `backend/api/src/auth/session-cookie.ts` | Session and cookie suites | Session cookie set; authenticated session returned redacted view | PASS for exercised behavior |
| CSRF token boundary | [`AUTHENTICATION_IMPLEMENTATION_PLAN.md`](AUTHENTICATION_IMPLEMENTATION_PLAN.md) | `backend/api/src/auth/session.service.ts`, CSRF/origin middleware, controller | CSRF/origin and session suites | CSRF endpoint returned a 43-character token | PARTIAL; negative mutation cases were not part of this verifier run |
| Logout revocation and anonymous denial | [`AUTHENTICATION_IMPLEMENTATION_PLAN.md`](AUTHENTICATION_IMPLEMENTATION_PLAN.md) | `backend/api/src/auth/auth.controller.ts`, `backend/api/src/auth/session.service.ts`, OIDC adapter | Session/AuthService suites | Logout, post-logout denial, and anonymous denial all passed | PASS for exercised behavior |
| Frontend-origin callback redirect | [`AUTHENTICATION_IMPLEMENTATION_PLAN.md`](AUTHENTICATION_IMPLEMENTATION_PLAN.md) | `FRONTEND_ORIGIN` validation and `AuthController.callback()` | `backend/api/src/auth/auth.controller.spec.ts`, environment-validation suite | `auth_login_status=PASS` after the redirect-contract correction | PASS for this runtime slice |

## 4. Static verification associated with the correction

The following commands were executed in the sandbox checkout `/home/ubuntu/Mohamy-pro-git` after the redirect correction:

| Command | Result |
|---|---|
| `pnpm --filter api exec jest --runInBand` | PASS — 19 suites, 79 tests |
| `pnpm --filter api exec eslint src` | PASS |
| `pnpm --filter api run build` | PASS |
| `python3 -m json.tool infrastructure/docker/keycloak/mohamy-realm.json` | PASS |
| `git diff --check` | PASS |

The correction was published only to `origin/phase2/legacy-tenant-boundaries` as commit `8ca694d2`. `origin/main` was not modified.

## 5. Remaining Phase 2 work

This document closes only the demonstrated authentication/session runtime slice. It does not close Phase 2. The authoritative remaining work includes authorization and effective permissions, tenant membership and tenant switching, audit events, API envelopes and idempotency, abuse and identity-data lifecycle controls, frontend authentication state and tenant-aware UX, broader integration-test topology, and the remaining tenant-aware infrastructure integration requirements.

The following authentication-related evidence remains unverified or partial:

| Item | Status |
|---|---|
| CSRF rejection for missing and mismatched tokens | UNVERIFIED by this happy-path verifier |
| Exact-origin rejection for disallowed or missing browser origins on state-changing requests | UNVERIFIED by this happy-path verifier |
| OIDC state replay, state mismatch, callback nonce mismatch, and expired transaction runtime cases | Unit-tested or design-covered; real Windows runtime evidence not recorded here |
| Refresh-token rotation and provider refresh failure handling | UNVERIFIED in this runtime run |
| Session idle and absolute expiry runtime behavior | UNVERIFIED in this runtime run |
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
