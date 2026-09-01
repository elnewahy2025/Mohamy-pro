# Phase 2 Completion Plan — Close the Identity + Multi-Tenancy Gate

**Plan status:** Draft for owner review. No Phase 2 completion claim is made, and Phase 3 does not begin until this gate is approved.

**Plan date:** 2026-09-01

**Repository revision at reconciliation:** `main` synced with `origin/main` at `6bf11d98` (0 ahead / 0 behind, clean working tree).

**Governing phase rule:** [`Plan.txt`](../../Plan.txt) line 1297 — *"لا تبدأ Phase 3 قبل اعتماد إغلاق Phase 2 بالكامل"* (Phase 3 must not begin before Phase 2 closure is fully approved). [`PHASE2_ENTRY_DECISION.md`](PHASE2_ENTRY_DECISION.md) rule 8 and [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md) lines 120-124 confirm the same gate.

## Objective

Produce, implement, and verify the remaining work required to approve the **Phase 2 completion gate**, so the phase is fully implemented, tested, evidenced, documented, and approved before Phase 3 (Security Foundation + Audit Foundation) begins. This plan reconciles the six "open" items recorded in [`ENGINEERING_GOVERNANCE_REVIEW.md`](ENGINEERING_GOVERNANCE_REVIEW.md) against the current repository, then closes each remaining gap with additive, evidence-backed work.

## Reconciliation result (evidence-based snapshot)

A fresh, evidence-based review at `6bf11d98` against the real code produced the closure map below. **CLOSED** items are implemented and wired; **OPEN / PARTIAL** items are the work of this plan.

### CLOSED (verified present in the current tree)

| Area | Evidence |
|---|---|
| RLS tenant boundaries for outbox/storage/idempotency | `edefc92a`; `prisma.service.withWorkerTenantContext`; additive migrations `20260831150000_.../60000.../70000...`; `phase2-rls-runtime-check.mjs` gates pass. |
| Phase 2 hierarchy / membership / RBAC / bootstrap / invitation / membership-admin | Identity schema, `PermissionsService.assertTenantPermission`, six-key catalog, `tenant.admin`/`platform.admin` wiring, `POST /api/v1/bootstrap`, invitation create/accept, membership suspend/expire/remove/reinstate. |
| Auth lifecycle + tenant-switch + MFA step-up | OIDC login/callback/me/logout/CSRF, `POST /api/v1/session/tenant-switch`, `MfaAssuranceService.assertRecentMfa`. Browser/Keycloak round-trip **confirmed** for auth (user-confirmed on Windows). |
| Global response envelopes + correlation + validation + idempotency contract | `SuccessEnvelopeInterceptor`, `HttpExceptionFilter`, `CorrelationIdMiddleware`, `ValidationPipe`, `IdempotencyInterceptor/Service` (replay/conflict/concurrency, header echo). |
| Abuse controls (most) | Redis-backed fail-closed rate limit, `helmet()` security headers, list-based CORS, per-session `CsrfGuard`, UUID-only identifiers, non-enumerating denial errors, audit of existing admin ops. |

### OPEN / PARTIAL (workstreams to close Phase 2)

| ID | Workstream | Gap (evidence) |
|---|---|---|
| W1 | Contract and e2e tests | **MISSING.** No `.contract.*`; `test/app.e2e-spec.ts` covers only liveness/readiness/metrics/OpenAPI. The frozen envelope / idempotency (replay/conflict/concurrency) / error / validation contract is unverified end-to-end. |
| W2 | OpenAPI fidelity | **PARTIAL.** Controllers/DTOs lack `@ApiProperty`/`@ApiBody`/`@ApiResponse` (only health/app use `@ApiOperation`). OpenAPI lacks DTO and route model schemas for business endpoints. |
| W3 | Named-policy RBAC matrix | **CLOSED.** `CanManageMembership` enforced (invitation + membership-admin). `CanSwitchTenant` added to catalog (`permission.constants.ts`) + additive migration `20260901120000`, wired to `tenant.admin`, granted as a membership-default to any ACTIVE membership, and enforced in `POST /session/tenant-switch`. Positive/negative/denial tests added for both enforced named policies. `CanReadOrganizationSettings` (docs-only, no route) recorded as an explicit deferral in `AUTHORIZATION_MATRIX.md` §4 — not a silent omission. Other catalogued-but-route-less policies recorded as "No dedicated route yet" decisions. |
| W4 | Failed-auth lockout + MFA-failure limit | **CLOSED.** Lockout is keyed on the immutable provider subject (the only auth identifier this OIDC-only repo has; `abuseAccountIdentifier` is null on every real path). `checkLockout` is enforced in `AuthService.handleCallback` before identity resolution (locked → `ACCOUNT_LOCKED` abuse event + `AbuseLimitReachedError`, fail-closed); a missing provider refresh token enumerates a failed auth via `registerAuthenticationFailure` (threshold → same lockout); a successful session creation calls `releaseLockout`, which clears the marker and emits `ACCOUNT_LOCK_RELEASED` only when a marker actually existed and never throws into the request path. `enforceMfaFailure` is wired into every `assertRecentMfa` call site (invitation `create`, membership-admin shared `transition`) with a shared `enforceMfaFailureLimit` helper (limit reached → `MFA_RATE_LIMITED` event + `AbuseLimitReachedError`, fail-closed; `MfaStepUpRequiredError` rethrown otherwise). Unit coverage added: `src/abuse/abuse-control.service.spec.ts` (releaseLockout: no-marker no-op, marker present clears+audits, audit-write failure swallowed), plus invitation + membership-admin MFA-limit positive/denial tests (19 W4 unit tests green). Metadata allowlist verified for all emitted events (`auth.account.locked` `reason`, `auth.account.lock.released` `[]`, `mfa.rate.limited` `reason`). |
| W5 | Auth-lifecycle + role audit events | **CLOSED.** `auth.login.started` emitted in `AuthService.beginLogin` (provider-safe global scope); `auth.login.succeeded` emitted after session creation (actor = user); `auth.login.denied` emitted on the no-refresh-token denial; `auth.logout` emitted after successful session revocation. `role.assigned` emitted transactionally at every role-assignment path: invitation `accept` (`assignRoles`, one event per granted role) and tenant bootstrap (`membershipRole.create`). `AuditEventService` injected into `AuthService`. Allowlist typo fixed: `'auth.login.start'` → the declared `AUDIT_EVENT_TYPES.LOGIN_STARTED` (`'auth.login.started'`); the four auth-login/logout keys now reference the event-type constants. Guard test added asserting every declared event type has a metadata allowlist entry. `auth.login.*`/`auth.logout` writes are secondary (audit failure does not fail an already-established session/redirect), documented as a relaxation of the strict transactionality rule for the pre-existing non-transactional `createSession`. |
| W6 | Bilingual frontend identity/membership flows | **MISSING.** No tenant-switch/bootstrap/invitation/membership-admin UI; only login/logout session display. Catalogs lack membership/tenant/form-error keys. `proxy.ts` misnamed (must be `middleware.ts`) so locale detection is not wired. No accessible form errors (`aria-invalid`/`aria-describedby`/`role="alert"` absent). **Generated-client re-entry gate not satisfied** (hand-rolled `ApiClient`). |
| W7 | API-level cross-tenant isolation e2e | **MISSING.** RLS proves DB isolation, but no HTTP e2e asserts Tenant A cannot reach Tenant B. |
| W8 | Browser/Keycloak round-trips (HTTP) | **PENDING.** Auth is done; bootstrap / invitations / membership-admin / tenant-switch HTTP round-trips remain user-PC steps. |
| W9 | Legal-domain authorization rows of the frozen matrix | **N/A yet (out of Phase 2 scope).** The matrix rows (lawyer assigned-case, branch/department scope, no-permanent-delete, cross-tenant Platform Admin data ops) require Case/legal-record surfaces that belong to Phase 5+. Record as **deferred with explicit rationale**, not silently dropped. |

## Workstreams and exit gates

Phase 2 must be additive (new `prisma migrate deploy` files only), preserve every frozen decision, and not weaken Phase 1 controls (rate limit, helmet, CORS, CSRF, correlation, metrics auth, OpenTelemetry, outbox safety, storage fail-closed, migration checks, bilingual LTR/RTL).

### W1 — Contract and e2e tests (CLOSE)
- Add contract/e2e coverage using the real HTTP stack that asserts the frozen envelope and error shapes.
- **Required evidence:**
  - Success envelope `{success,data,meta}` and error envelope `{success:false,error,meta}` on a representative business route.
  - Correlation ID present and echoed.
  - Idempotency replay returns stored body + `Idempotency-Key` header; conflicting reuse returns 409; concurrent reservation returns safe result.
  - Validation failure returns `VALIDATION_FAILED` with details; unknown property is rejected (`forbidNonWhitelisted`).
  - 5xx collapses to generic internal-error; non-enumerating denial.
- **Exit gate:** a named contract suite (e.g. `test/*.contract-spec.ts`) passes; sample output preserved as evidence.

### W2 — OpenAPI fidelity (CLOSE)
- Add `@ApiProperty` to DTOs and `@ApiBody`/`@ApiResponse`/`@ApiOperation` to business route handlers so the generated document describes DTO and route models and errors.
- **Exit gate:** `api/docs-json` includes DTO schemas and per-route responses for all Phase 2 endpoints (schema diff captured as evidence).

### W3 — Named-policy enforcement (CLOSE)
- Enforce named policies rather than ad hoc checks: gate tenant-switch with a `CanSwitchTenant` decision and add/assert the missing named policies where a route exists.
- Options for the two docs-only keys: (a) add to the catalog if a real route requires them, or (b) record an explicit "no route yet" decision in the matrix. Either must be auditable; **no silent omission**.
- Add positive/negative/denial tests for each enforced named policy.
- **Exit gate:** every frozen named policy with an implemented route is enforced and tested; the RBAC matrix update is reviewed.

### W4 — Failed-auth lockout + MFA-failure limit (CLOSE)
- Wire `registerAuthenticationFailure` into the auth failure path and `checkLockout` into the login path (fail-closed semantics consistent with the Phase 1/2 rate-limit decision).
- Wire `enforceMfaFailure` into the MFA-sensitive paths that already call `assertRecentMfa`.
- Emit `ACCOUNT_LOCKED` / `ACCOUNT_LOCK_RELEASED` honestly; add tests.
- **Exit gate:** lockout and MFA-failure limits are reachable and covered by unit tests; behavior is audited in the relevant decision doc (no contradiction).

### W5 — Auth-lifecycle + role audit events (CLOSE)
- Emit `auth.login.started/succeeded/denied`, `auth.logout`, `role.assigned` from the real auth/role paths (append-only, redacted, allowlist-respecting).
- Fix the `'auth.login.start'` vs `'auth.login.started'` allowlist typo and add a guard test.
- **Exit gate:** lifecycle events are emitted and asserted; audit-event allowlist is consistent.

### W6 — Bilingual frontend identity/membership flows (CLOSE)
- Rename `proxy.ts` → `middleware.ts` so next-intl locale detection is wired.
- Add the identity/membership UI surfaces and message keys (English + Arabic) for tenant-switch, bootstrap, invitation, membership-admin, and accessible form errors (`aria-invalid`, `aria-describedby`, `role="alert"`).
- Satisfy the **generated-client re-entry gate**: consume the approved API contract through generated types (or record an explicit, reviewed decision if a hand-rolled client is retained — the Phase 1 `GENERATED_CLIENT_DECISION` requires this re-entry on Phase 2 closure review).
- **Exit gate:** flows render correctly in en + ar, LTR/RTL, with accessible form errors and keyboard navigation; frontend tests cover the flows; no frontend authorization decisions absent from backend responses.

### W7 — API-level cross-tenant isolation e2e (CLOSE)
- Add an HTTP e2e asserting Tenant A cannot read/modify Tenant B data through the API (complementing the DB-level RLS check).
- **Exit gate:** the e2e passes and is included in the evidence.

### W8 — Browser/Keycloak HTTP round-trips (SIGN-OFF REQUIRED, user-PC)
- The remaining bootstrap / invitations / membership-admin / tenant-switch round-trips are user-PC steps (real OIDC login + MFA).
- **Exit gate:** owner-confirmed round-trips are captured as evidence in the verification docs. If owner scope excludes them, record an explicit decision.

### W9 — Legal-domain authorization matrix rows (DEFER with rationale, not silent)
- Document why these rows cannot be closed in Phase 2 (no Case/legal-record surface) and defer to the phase that introduces them.
- **Exit gate:** an explicit, reviewed deferral note in `AUTHORIZATION_MATRIX` / completion record, not a silent omission.

## Required test matrix (Phase 2 closure additions)

| Test group | Minimum acceptance evidence |
|---|---|
| API contract / e2e | Envelope, error, correlation, idempotency replay/conflict/concurrency, validation, OpenAPI schema presence — all pass. |
| Authorization | Every implemented named policy has positive + negative + explicit-denial tests; Platform Admin restrictions (MFA, no elevate) covered. |
| Lockout / MFA limit | Failed-auth lockout reachable; MFA-failure limit reachable; events emitted. |
| Tenant isolation (API) | Tenant A cannot reach Tenant B via HTTP; RLS check remains PASS. |
| Frontend bilingual | Identity/membership flows render correctly in en + ar with LTR/RTL, accessible errors, keyboard nav. |
| Security pipeline | No new secret/SAST/dependency regressions introduced by the closure work. |

## Completion gate decision

Phase 2 is complete and the completion gate is approved **only when**:
1. Every workstream above is implemented and its exit gate evidence is recorded (or an explicit reviewed deferral/decision is recorded for W8/W9).
2. Backend + web `tsc --noEmit` = 0 errors; `prisma validate` clean; full jest + added contract/e2e/authorization suites pass.
3. `docs/phase2` records a completion-closure review that carries the exact production wording and confirms no unqualified production claim.
4. The owner approves the Phase 2 completion gate **before** any Phase 3 planning document is treated as authorized for coding.

## What this plan does not do

- It does not authorize Phase 3 work. Phase 3 (Security Foundation + Audit Foundation) remains blocked until this gate is approved per the forced phase rule.
- It does not claim production readiness. The Linux KMS/object-storage production plane and the exact production wording from the Phase 1 boundary remain open and mandatory before any unqualified production claim.

## References

1. [`Plan.txt`](../../Plan.txt)
2. [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md)
3. [`PHASE2_ENTRY_DECISION.md`](PHASE2_ENTRY_DECISION.md)
4. [`ENGINEERING_GOVERNANCE_REVIEW.md`](ENGINEERING_GOVERNANCE_REVIEW.md)
5. `docs/phase2/*DECISION.md` and `*_IMPLEMENTATION.md` and `HOSTED_*_RUNTIME_VERIFICATION.md`
6. [`docs/phase0/AUTHORIZATION_MATRIX.md`](../phase0/AUTHORIZATION_MATRIX.md)
7. [`docs/phase1/GENERATED_CLIENT_DECISION.md`](../phase1/GENERATED_CLIENT_DECISION.md)
8. [`docs/phase1/FINAL_CLOSURE_REVIEW.md`](../phase1/FINAL_CLOSURE_REVIEW.md)

## Status of this document

**Draft for owner review.** No Phase 2 completion is claimed. Commit status is pending owner instruction.