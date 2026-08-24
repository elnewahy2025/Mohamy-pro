# Phase 2 Membership Lifecycle and Tenant-Switch Implementation Plan

**Status:** Implementation connected; static verification passed; covered Windows/database/runtime evidence verified on 2026-08-24; broader Phase 2 evidence and approval remain pending.

**Scope:** Phase 2 only. This document defines the next implementation slice after the verified authentication/session and user-state evidence. It does not authorize Phase 3 work or imply that Phase 2 is complete.

## 1. Governing decisions

The implementation follows the approved account-lifecycle and tenant-membership decisions. `User` is a global application identity, while `Membership` binds that identity to one `Tenant`. Ordinary tenant context is derived from a server-side active membership and never from a browser-provided tenant identifier. A user may retain an application session while having zero active memberships, but ordinary tenant-scoped operations must return the controlled `TENANT_CONTEXT_REQUIRED` result. [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md) [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)

Membership states are `INVITED`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, and `REMOVED`. Only `ACTIVE` membership may establish tenant context, and the active window must allow the current time. The user must be `ACTIVE`, and the target tenant must be `ACTIVE`. A missing, unknown, inactive, suspended, expired, removed, or cross-user target has one non-enumerating failure class. [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)

The switch operation is `POST /api/v1/session/tenant-switch`. It accepts a target tenant identifier and an optimistic `expectedContextVersion` only as selectors. It authenticates the session, inherits the global exact-origin and CSRF boundary, requires a UUIDv4 `Idempotency-Key`, verifies the target membership inside a membership-selection transaction, updates the server-side session atomically, increments `contextVersion`, and returns only server-derived context in the frozen business envelope. [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md) [`API_ENVELOPE_IDEMPOTENCY_DECISION.md`](API_ENVELOPE_IDEMPOTENCY_DECISION.md)

## 2. Transaction contract

The service will expose a session-bound switch operation whose inputs are the authenticated session ID, authenticated user ID, target tenant ID, idempotency operation context, and a correlation ID. The service will not accept a client-supplied membership ID as authority. The target tenant ID is validated as a UUID selector, then resolved by `(userId, tenantId)` within `withMembershipSelectionContext()`. That context clears `app.tenant_id` and `app.membership_id` before the lookup so a stale tenant context cannot influence membership selection.

The lookup must require all of the following conditions in the same transaction: the membership exists for the authenticated user and target tenant; membership status is `ACTIVE`; `activeFrom` is absent or not later than `now`; `activeUntil` is absent or later than `now`; the target tenant exists and has status `ACTIVE`; and the authenticated user is still `ACTIVE`. The service must not disclose which condition failed.

After validation, the service updates exactly one active `AppSession` row using a compare-and-set predicate containing the session ID, authenticated user ID, current session status `ACTIVE`, and the observed `contextVersion`. The update sets `activeTenantId` and `activeMembershipId` together and increments `contextVersion`. If the update count is not exactly one, the transaction fails closed rather than returning a context that may belong to a concurrent session state.

The returned context contains the server-derived target tenant and membership identifiers only through the approved response contract. It does not return unrestricted role or permission claims, provider tokens, raw cookies, or database diagnostics. The source tenant is derived from the authenticated session for audit when present; it is not accepted from the request.

## 3. Membership-state behavior

| State or condition | Application session | Ordinary tenant context | Switch result |
|---|---|---|---|
| User `ACTIVE`, membership `ACTIVE`, tenant `ACTIVE`, active window valid | Retained | Allowed for the selected membership | Success |
| User `PENDING` with zero memberships | Retained for controlled onboarding/session view | Denied; `tenantContext` remains null | Controlled no-membership result for tenant operations |
| Zero active memberships | Retained | Denied; no tenant context is created | Controlled `TENANT_CONTEXT_REQUIRED` for tenant operations |
| Membership `INVITED` | Retained | Denied | Non-enumerating switch failure |
| Membership `SUSPENDED` | Retained if the user remains otherwise eligible | Denied for the affected tenant | Non-enumerating switch failure; another active membership may be selected |
| Membership `EXPIRED` or outside its active window | Retained | Denied for the affected tenant | Non-enumerating switch failure |
| Membership `REMOVED` | Retained | Denied permanently for that membership | Non-enumerating switch failure |
| Tenant `PENDING`, `SUSPENDED`, or `ARCHIVED` | Retained | Denied for that tenant | Non-enumerating switch failure |
| User `SUSPENDED`, `DISABLED`, or `DELETED` | Sessions must already be revoked by the user-state transition boundary | Denied | Authentication/session denial; no context creation |
| Target belongs to another user or is unknown | Retained | Unchanged | Same non-enumerating switch failure |

Membership suspension or expiry does not revoke the entire application session when another active membership remains. The selected tenant context is revalidated during authenticated session lookup and is cleared when no longer eligible; a dedicated switch to another valid active membership is required. This behavior and the connected tenant-switch endpoint are verified for the covered Windows runtime cases in Section 8; concurrency and broader Phase 2 gates remain open.

## 4. HTTP and idempotency contract

The controller route is versioned as `/api/v1/session/tenant-switch`. It uses `SessionGuard`, the existing exact-origin and CSRF middleware, a DTO that rejects unknown fields, and the standard Phase 2 success/error envelopes. The request body contains `tenantId` and `expectedContextVersion`; neither is trusted as membership authority. No ordinary tenant-scoped route may use a tenant header, cookie, or body field as authority.

The route reserves and completes idempotency with the existing `IdempotencyService`. Because tenant switching changes the session’s tenant context, the interceptor uses a stable authenticated-actor `GLOBAL` scope for this route; the request fingerprint still includes the canonical target and expected context version. The normalized method and route are `POST` and `/api/v1/session/tenant-switch`. The same key and body replay the stored result without a second session update; a changed body, route, actor, or scope returns the controlled conflict result; an active reservation returns the controlled in-progress result.

The Phase 2 business interceptor and exception filter are now connected for this route, and deterministic contract tests cover success, replay, malformed-key, and terminal-error behavior. The envelope migration is bounded to the connected Phase 2 business path; legacy authentication and operational compatibility paths remain explicitly preserved.

## 5. Audit and outbox dependency

A successful switch emits an append-only tenant-switch audit event containing the actor membership, source tenant when available, target tenant, correlation ID, result, and bounded reason metadata without raw tokens or cookies. Failed switches persist the approved bounded denial/security event through the durable global audit path after the selection transaction rolls back. The connected `AuditEvent` model, audit writer, retention control, and idempotent audit outbox handler are covered by deterministic tests; the Windows verifier exercised the connected audit/outbox path after the additive migration was applied, while append-only enforcement, retention behavior, duplicate/retry/dead-letter delivery, and the broader worker campaign remain pending. A normal application log is not an audit substitute. [`AUDIT_EVENT_FOUNDATION_DECISION.md`](AUDIT_EVENT_FOUNDATION_DECISION.md)

The state update, audit event, idempotency completion, and outbox enqueue share the switch transaction. Duplicate delivery is safe because the worker validates the persisted audit-event reference and never creates a second audit row. No provider token, raw cookie, invitation token, or unrestricted permission payload enters the audit or outbox record.

## 6. Required verification topology

The deterministic unit tests cover UUID and unknown-field validation at the connected DTO/interceptor boundary, valid active membership, invited/suspended/expired/removed membership denial, invalid active windows, non-active user denial, compare-and-set conflict, idempotency replay/conflict/error persistence, audit redaction and retention validation, and stale-current-context denial. CSRF/origin, PostgreSQL persistence, concurrency, and transaction rollback remain part of the final integration campaign. Tests assert server-derived context fields without exposing identifiers in runtime output.

The real PostgreSQL and Redis integration verifier is connected as `auth-membership-runtime-check.mjs`. It creates a development verification tenant and membership without destructive reset, authenticates real sessions, exercises a valid switch, checks frozen envelopes and idempotency conflict behavior, tests invited/suspended/expired/removed states, confirms zero effective memberships retain session access without tenant context, and archives/clears its fixture state. It was executed once on Windows on 2026-08-24 after the additive migration, API, worker, PostgreSQL, Redis, and Keycloak readiness gates passed; the exact bounded evidence is recorded in Section 8.

## 7. Requirements traceability

| Requirement | Source | Planned implementation | Planned tests | Planned evidence | Status |
|---|---|---|---|---|---|
| Tenant context is derived from active membership | `TENANT_MEMBERSHIP_SWITCHING_DECISION.md` | Membership-selection transaction and server-side `AppSession` update | Membership-state and tenant-context tests | Real switch and denial markers | IMPLEMENTED; COVERED WINDOWS RUNTIME VERIFIED; BROADER RUNTIME PENDING |
| Only active, in-window membership of an active tenant may switch | `TENANT_MEMBERSHIP_SWITCHING_DECISION.md` | Service predicate on user, membership, dates, and tenant status | Positive and all negative membership-state cases | PostgreSQL persisted-state verifier | IMPLEMENTED; COVERED WINDOWS RUNTIME VERIFIED; BROADER RUNTIME PENDING |
| One active tenant context per session | `TENANT_MEMBERSHIP_SWITCHING_DECISION.md` | Atomic compare-and-set update of `activeTenantId`, `activeMembershipId`, and `contextVersion` | Concurrency and stale-version tests | Runtime context aggregate | IMPLEMENTED; COVERED WINDOWS RUNTIME VERIFIED; CONCURRENCY PENDING |
| Tenant switch requires CSRF, exact origin, and idempotency | `API_ENVELOPE_IDEMPOTENCY_DECISION.md` and `TENANT_MEMBERSHIP_SWITCHING_DECISION.md` | Controller guard/middleware/idempotency integration | API negative-path and replay/conflict tests | Real HTTP verifier | IMPLEMENTED; COVERED WINDOWS RUNTIME VERIFIED; BROADER NEGATIVE/CONCURRENCY PENDING |
| Switch success and failure use frozen envelopes | `API_ENVELOPE_IDEMPOTENCY_DECISION.md` | Envelope interceptor/filter and OpenAPI schemas | Contract tests and generated-client checks | OpenAPI and HTTP evidence | IMPLEMENTED ON CONNECTED ROUTE; COVERED WINDOWS RUNTIME VERIFIED; GENERATED-CLIENT/BROADER RUNTIME PENDING |
| Switch is audited and linked to durable event delivery | `AUDIT_EVENT_FOUNDATION_DECISION.md` | Audit model/service and transactional outbox event | Persistence, redaction, duplicate-delivery tests | Database and worker trace evidence | IMPLEMENTED; COVERED WINDOWS AUDIT/OUTBOX PATH EXERCISED; APPEND-ONLY/RETENTION/DELIVERY CAMPAIGN PENDING |

## 8. Windows runtime evidence (2026-08-24)

The existing Windows database was preserved. Before the runtime attempt, the required Docker containers were running with the intended restart policies; PostgreSQL, Redis, and MinIO reported healthy; PostgreSQL, Redis, MinIO, and Keycloak host ports were reachable; Keycloak discovery returned HTTP 200; the checkout was fast-forwarded to `08f65fcd`; the additive audit migration was applied successfully; and the post-sync install, Prisma generation, migration, build, and verifier syntax gates passed. The API and worker then started successfully, including PostgreSQL/Redis connections, queue readiness, and outbox worker readiness. The verifier was executed exactly once.

The following bounded markers are the exact Windows output for the covered runtime attempt:

```text
auth_membership_precheck=PASS|sessions=2|original_status=PENDING|tenant_context=false
auth_membership_initial_switch_diagnostic=status=200|success=true|error_code=none
auth_membership_switch_status=PASS|tenant_context=true|version=1
auth_membership_idempotency_replay_status=PASS|http=200|version=1
auth_membership_idempotency_conflict_status=PASS|http=409
auth_membership_invited_status=PASS|http=403|context_cleared=true
auth_membership_suspended_status=PASS|http=403|context_cleared=true
auth_membership_expired_status=PASS|http=403|context_cleared=true
auth_membership_removed_status=PASS|http=403|context_cleared=true
auth_membership_stale_context_status=PASS|http=409|context_preserved=true
auth_membership_zero_status=PASS|session_access=true|tenant_context=false
auth_membership_restore_status=PASS|tenant_archived=true|context_cleared=true
auth_membership_runtime_result=PASS
```

This evidence verifies the covered positive switch, frozen success envelope, exact idempotent replay, changed-body conflict, ineligible membership denials with stale-context clearing, stale-version conflict, zero-membership session retention, and fixture restoration. It does not by itself close the complete Phase 2 plan: concurrency under load, full append-only/retention/legal-hold behavior, duplicate/retry/dead-letter worker delivery, authorization policy/MFA, onboarding/invitation administration, generated client, frontend English/Arabic RTL/LTR, broader lifecycle/abuse controls, and future Linux KMS/object-storage/TLS/operational deployment remain open.

## 9. Explicit non-goals and open boundaries

This slice does not begin Phase 3, implement legal-domain authorization, implement MFA assurance, or complete invitation/onboarding workflows. It does not claim that all membership transitions are production-ready, that PostgreSQL append-only/retention behavior is runtime-proven, or that the development Windows-Docker topology proves the future Linux KMS/object-storage deployment. The connected implementation remains subject to the deferred complete runtime campaign and approval.

## References

1. [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md)
2. [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)
3. [`API_ENVELOPE_IDEMPOTENCY_DECISION.md`](API_ENVELOPE_IDEMPOTENCY_DECISION.md)
4. [`AUDIT_EVENT_FOUNDATION_DECISION.md`](AUDIT_EVENT_FOUNDATION_DECISION.md)
5. [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md)
6. [`skills/engineering-governance/SKILL.md`](../../skills/engineering-governance/SKILL.md)
