# Phase 2 Membership Lifecycle and Tenant-Switch Implementation Plan

**Status:** Design ready for implementation; not runtime-verified.

**Scope:** Phase 2 only. This document defines the next implementation slice after the verified authentication/session and user-state evidence. It does not authorize Phase 3 work or imply that Phase 2 is complete.

## 1. Governing decisions

The implementation follows the approved account-lifecycle and tenant-membership decisions. `User` is a global application identity, while `Membership` binds that identity to one `Tenant`. Ordinary tenant context is derived from a server-side active membership and never from a browser-provided tenant identifier. A user may retain an application session while having zero active memberships, but ordinary tenant-scoped operations must return the controlled `TENANT_CONTEXT_REQUIRED` result. [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md) [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)

Membership states are `INVITED`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, and `REMOVED`. Only `ACTIVE` membership may establish tenant context, and the active window must allow the current time. The user must be `ACTIVE`, and the target tenant must be `ACTIVE`. A missing, unknown, inactive, suspended, expired, removed, or cross-user target has one non-enumerating failure class. [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)

The switch operation is `POST /api/v1/session/tenant-switch`. It accepts a target tenant identifier only as a selector. It must authenticate the session, enforce the global exact-origin and CSRF boundary, require a UUIDv4 `Idempotency-Key`, verify the target membership inside a membership-selection transaction, update the server-side session atomically, increment `contextVersion`, and return only server-derived context and safe navigation metadata. [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md) [`API_ENVELOPE_IDEMPOTENCY_DECISION.md`](API_ENVELOPE_IDEMPOTENCY_DECISION.md)

## 2. Transaction contract

The service will expose a session-bound switch operation whose inputs are the authenticated session ID, authenticated user ID, target tenant ID, idempotency operation context, and a correlation ID. The service will not accept a client-supplied membership ID as authority. The target tenant ID is validated as a UUID selector, then resolved by `(userId, tenantId)` within `withMembershipSelectionContext()`. That context clears `app.tenant_id` and `app.membership_id` before the lookup so a stale tenant context cannot influence membership selection.

The lookup must require all of the following conditions in the same transaction: the membership exists for the authenticated user and target tenant; membership status is `ACTIVE`; `activeFrom` is absent or not later than `now`; `activeUntil` is absent or later than `now`; the target tenant exists and has status `ACTIVE`; and the authenticated user is still `ACTIVE`. The service must not disclose which condition failed.

After validation, the service updates exactly one active `AppSession` row using a compare-and-set predicate containing the session ID, authenticated user ID, current session status `ACTIVE`, and the observed `contextVersion`. The update sets `activeTenantId` and `activeMembershipId` together and increments `contextVersion`. If the update count is not exactly one, the transaction fails closed rather than returning a context that may belong to a concurrent session state.

The returned context contains the server-derived target tenant and membership identifiers only through the approved response contract. It must not return unrestricted role or permission claims, provider tokens, raw cookies, or database diagnostics. The source tenant may be recorded for audit when present, but it is not accepted from the request.

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

Membership suspension or expiry does not revoke the entire application session when another active membership remains. The selected tenant context must instead be revalidated before tenant-scoped access, and a dedicated switch to another valid active membership is required. The current implementation has no connected tenant-scoped business endpoint; that endpoint and its `TENANT_CONTEXT_REQUIRED` envelope remain part of this workstream’s integration evidence.

## 4. HTTP and idempotency contract

The controller route is versioned as `/api/v1/session/tenant-switch`. It uses `SessionGuard`, the existing exact-origin and CSRF middleware, a DTO that rejects unknown fields, and the standard Phase 2 success/error envelopes. The request body contains only `tenantId`. No ordinary tenant-scoped route may use a tenant header, cookie, or body field as authority.

The route must reserve and complete idempotency with the existing `IdempotencyService`. The idempotency scope is the authenticated actor and the server-derived current tenant scope, or `GLOBAL` when no active tenant context exists for the initial selector operation, according to the approved scope contract. The normalized method and route are `POST` and `/api/v1/session/tenant-switch`. The request fingerprint includes the server-scoped actor/tenant identity and canonical body. The same key and body must replay the stored result without a second session update; a changed body, route, actor, or scope must return `409 IDEMPOTENCY_CONFLICT`; an active reservation must return `409 IDEMPOTENCY_IN_PROGRESS`.

Because the current global exception filter still emits the Phase 1 error shape, the route must not be accepted as a fully compliant Phase 2 business endpoint until the approved envelope interceptor/filter migration and controller contract tests are included in the same dependency chain. If implementation is staged, the documentation must mark the route as partial rather than silently claiming frozen API compliance.

## 5. Audit and outbox dependency

A successful switch must emit an append-only tenant-switch audit event containing the actor, a session-safe identifier, source tenant when available, target tenant, correlation ID, result, reason, and trace metadata without raw tokens or cookies. Failed switches must produce the approved bounded denial/security event when the audit foundation is connected. The current repository has no `AuditEvent` model or connected audit service, so the switch implementation must either include the approved minimum audit persistence in the same change or remain explicitly blocked from a completion claim. A normal application log is not an audit substitute. [`AUDIT_EVENT_FOUNDATION_DECISION.md`](AUDIT_EVENT_FOUNDATION_DECISION.md)

If the state update and event publication require atomicity, the event must be written through the existing transactional outbox with the server-derived context. Duplicate delivery must be safe, and the worker path must preserve the event’s tenant and membership context. No provider token, raw cookie, invitation token, or unrestricted permission payload may enter the audit or outbox record.

## 6. Required verification topology

The deterministic unit tests must cover UUID and unknown-field validation, no-session denial, CSRF/origin denial, missing/invalid idempotency keys, valid active membership, zero-membership denial, invited/suspended/expired/removed membership denial, invalid active windows, inactive tenant denial, cross-user target denial, user-state denial, compare-and-set conflict, replay, conflict, concurrent switch, and transaction rollback. The tests must assert the session’s persisted `activeTenantId`, `activeMembershipId`, and incremented `contextVersion` without exposing identifiers in output.

The real PostgreSQL and Redis integration verifier must create or identify isolated development fixtures without destructive database reset, authenticate a real session, exercise a valid switch, read only bounded aggregate evidence, and restore or revoke the verifier-created state. It must prove that the same session retains only one active context, an invalid target does not change the existing context, and a concurrent or stale-version update fails closed. It must also prove that zero, suspended, expired, and removed memberships cannot establish tenant context, while an alternate active membership can be selected when the approved API and audit dependencies are present.

## 7. Requirements traceability

| Requirement | Source | Planned implementation | Planned tests | Planned evidence | Status |
|---|---|---|---|---|---|
| Tenant context is derived from active membership | `TENANT_MEMBERSHIP_SWITCHING_DECISION.md` | Membership-selection transaction and server-side `AppSession` update | Membership-state and tenant-context tests | Real switch and denial markers | UNVERIFIED |
| Only active, in-window membership of an active tenant may switch | `TENANT_MEMBERSHIP_SWITCHING_DECISION.md` | Service predicate on user, membership, dates, and tenant status | Positive and all negative membership-state cases | PostgreSQL persisted-state verifier | UNVERIFIED |
| One active tenant context per session | `TENANT_MEMBERSHIP_SWITCHING_DECISION.md` | Atomic compare-and-set update of `activeTenantId`, `activeMembershipId`, and `contextVersion` | Concurrency and stale-version tests | Runtime context aggregate | UNVERIFIED |
| Tenant switch requires CSRF, exact origin, and idempotency | `API_ENVELOPE_IDEMPOTENCY_DECISION.md` and `TENANT_MEMBERSHIP_SWITCHING_DECISION.md` | Controller guard/middleware/idempotency integration | API negative-path and replay/conflict tests | Real HTTP verifier | UNVERIFIED |
| Switch success and failure use frozen envelopes | `API_ENVELOPE_IDEMPOTENCY_DECISION.md` | Envelope interceptor/filter and OpenAPI schemas | Contract tests and generated-client checks | OpenAPI and HTTP evidence | BLOCKED until envelope integration is included |
| Switch is audited and linked to durable event delivery | `AUDIT_EVENT_FOUNDATION_DECISION.md` | Audit model/service and transactional outbox event | Persistence, redaction, duplicate-delivery tests | Database and worker trace evidence | BLOCKED until audit foundation is included |

## 8. Explicit non-goals and open boundaries

This slice does not begin Phase 3, implement legal-domain authorization, implement MFA assurance, complete invitation/onboarding workflows, claim that all membership transitions are production-ready, or claim that the existing Phase 1 exception shape satisfies the Phase 2 envelope. The future Linux KMS/object-storage deployment gate remains separate. Until the API envelope, idempotency request integration, audit persistence, tenant-scoped endpoint, and real runtime verifier are connected, membership and tenant switching remain `UNVERIFIED` or `BLOCKED` as indicated above.

## References

1. [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md)
2. [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)
3. [`API_ENVELOPE_IDEMPOTENCY_DECISION.md`](API_ENVELOPE_IDEMPOTENCY_DECISION.md)
4. [`AUDIT_EVENT_FOUNDATION_DECISION.md`](AUDIT_EVENT_FOUNDATION_DECISION.md)
5. [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md)
6. [`skills/engineering-governance/SKILL.md`](../../skills/engineering-governance/SKILL.md)
