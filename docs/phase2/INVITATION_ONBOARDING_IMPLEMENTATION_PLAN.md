# Invitation and Administrative Onboarding Implementation Plan

**Workstream:** Phase 2 invitation and administrative onboarding.

**Status:** Authorized for implementation on the local Windows/Docker Desktop boundary. Phase 2 remains open and Phase 3 is prohibited.

## Objective

Implement the application-owned invitation lifecycle required by the approved Phase 2 account, membership, tenant-switching, authorization, and abuse decisions. The workstream will provide protected tenant-administration endpoints for invitation creation and revocation, an authenticated provider-bound acceptance endpoint for pending users, single-use hashed token handling, role and scope assignment, audit/outbox linkage, controlled errors, Redis-backed acceptance throttling, and real PostgreSQL/Redis runtime evidence.

## Scope and endpoint contract

| Operation         | Endpoint                                                          | Security boundary                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create invitation | `POST /api/v1/tenants/:tenantId/invitations`                      | Authenticated session, active target membership, `CanManageMembership`, recent provider MFA, CSRF/origin, UUIDv4 idempotency key, tenant RLS context.                                             |
| Revoke invitation | `POST /api/v1/tenants/:tenantId/invitations/:invitationId/revoke` | Same tenant administration boundary; only a pending invitation in an active tenant can be revoked.                                                                                                |
| Accept invitation | `POST /api/v1/invitations/accept`                                 | Authenticated Keycloak-backed application session, including a `PENDING` user with no active membership; no client tenant selector; global idempotency scope until a new membership is activated. |

Create responses return an opaque invitation token **only in the one-time issuance response**, together with the invitation identifier and expiry. The raw token is never persisted, logged, audited, returned by later reads, or included in outbox payloads. The repository contains no email-delivery integration, so delivery is an explicit caller/provider boundary rather than an invented mailer implementation. Acceptance receives the token over the approved secure channel and verifies the authenticated provider subject or verified email binding.

## Frozen behavior

Invitation creation requires exactly one intended identity binding: a normalized verified email address or an exact provider subject. Email matching never links an identity implicitly; acceptance must bind the invitation to the authenticated session’s provider identity or to the verified email already stored on the application User. The invitation is opaque, single-use, hashed with SHA-256 at rest, expires after 72 hours, and transitions only through controlled terminal states.

Requested roles must be existing tenant-scoped roles in the target tenant. `platform_admin` and all global roles are rejected. The inviter cannot grant a role or scope that the named policy does not allow, and Tenant Admin cannot elevate a user to Platform Admin. Requested branch, department, and team scope is validated against the target tenant and persisted on each accepted membership-role assignment so the authorization loader can enforce it. A non-empty scope without a supported persisted assignment is not silently ignored.

Acceptance is atomic. Inside one controlled transaction, the service validates token status, expiry, tenant state, intended identity, inviter authority, requested roles and scope, and the accepting User state; creates or updates the target Membership from `INVITED` to `ACTIVE`; creates the approved role assignments; binds no tenant context until the transaction has passed every check; marks the Invitation `ACCEPTED`; clears or irreversibly invalidates the token hash; records a redacted audit event; and creates the linked transactional outbox message. Any failure rolls back all state changes and leaves the invitation usable unless the failure is a terminal token-state transition explicitly required by the lifecycle policy.

Invitation revocation is atomic and tenant-scoped. It marks only a `PENDING` invitation as `REVOKED`, invalidates the token hash, and emits a redacted audit/outbox record. Expired pending invitations are terminalized as `EXPIRED` during a verified lookup or controlled maintenance path. Replays, wrong identity, expired, revoked, cross-tenant, inactive-tenant, and unauthorized-inviter cases use controlled non-enumerating error behavior.

The acceptance limiter uses the approved Redis boundary of 10 attempts per invitation fingerprint and source IP within one hour, with bounded keys and fail-closed behavior when Redis is unavailable. Raw tokens, full email addresses, provider subjects, cookies, and invitation identifiers are not placed in logs or unbounded metric labels.

## Database changes

The existing `Invitation` model and RLS table are retained. An additive migration adds a validated JSON assignment-scope column to `MembershipRole`, preserving all applied migration history. The migration adds only the minimum constraint/index changes required for role-assignment scope and does not grant `BYPASSRLS`, broaden tenant visibility, or make invitation rows globally readable.

Invitation administration runs inside the existing tenant context. Acceptance uses a dedicated transaction-local invitation-acceptance context that is restricted by the hashed token and authenticated application user, allowing only the exact invitation lookup/update and the target user’s membership activation required for this workflow. The context must fail closed and must not become a general tenant or global bypass.

## Requirements traceability

| Requirement                     | Source                                                                                            | Implementation                                                                                        | Tests and evidence                                           | Status                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------- |
| Authorized invitation creation  | `ACCOUNT_LIFECYCLE_DECISION.md` §§38–50; `TENANT_MEMBERSHIP_SWITCHING_DECISION.md` §§68–74        | Tenant invitation controller/service, named `CanManageMembership`, MFA, CSRF, idempotency, tenant RLS | Unit, API, and Windows runtime tests                         | UNVERIFIED until executed         |
| Opaque single-use 72-hour token | `ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md` §§43–48, 70–73                                    | Random token issuance, SHA-256 hash, terminal state transitions, no raw-token logging                 | Token hash/response/redaction/lifecycle tests                | UNVERIFIED until executed         |
| Provider-bound acceptance       | `ACCOUNT_LIFECYCLE_DECISION.md` §§40–50; `TENANT_MEMBERSHIP_SWITCHING_DECISION.md` §§68–74        | Session-derived provider subject/email checks; no browser identity authority                          | success, wrong identity, no membership, replay, expiry tests | UNVERIFIED until executed         |
| Role and scope integrity        | `PHASE2_IMPLEMENTATION_PLAN.md` §§65–69; `TENANT_MEMBERSHIP_SWITCHING_DECISION.md` §§68–74        | Tenant-role validation, global-role rejection, persisted assignment scope, authorization loading      | role-elevation, cross-tenant, scope, policy tests            | UNVERIFIED until executed         |
| Atomic membership activation    | `ACCOUNT_LIFECYCLE_DECISION.md` §§44–48; `TENANT_MEMBERSHIP_SWITCHING_DECISION.md` §72            | One transaction for checks, membership, assignments, invitation terminalization, audit, and outbox    | rollback and persisted-state tests                           | UNVERIFIED until executed         |
| Revocation and expiry           | `ACCOUNT_LIFECYCLE_DECISION.md` §§50, 73; `ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md` §§70–81 | Tenant-scoped revocation, expiry terminalization, token invalidation                                  | revoke, expired, tenant archive, repeat tests                | UNVERIFIED until executed         |
| Invitation abuse controls       | `ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md` §§18, 22, 83–102                                  | Redis atomic limiter, bounded keys, fail-closed unavailable behavior                                  | real Redis acceptance-limit matrix                           | UNVERIFIED until executed         |
| Audit and outbox                | `PHASE2_IMPLEMENTATION_PLAN.md` §§29–30, 91–95; `AUDIT_EVENT_FOUNDATION_DECISION.md`              | Allowlisted invitation events, redacted metadata, tenant context, transactional outbox                | worker delivery, retry, duplicate, cleanup evidence          | UNVERIFIED until executed         |
| API contract                    | `PHASE2_IMPLEMENTATION_PLAN.md` §§27, 85–89                                                       | DTOs, standard envelopes, OpenAPI metadata, generated-contract follow-up                              | contract tests and generated-client re-entry                 | PARTIAL until later contract gate |

## Acceptance gate

This workstream is not accepted until the affected source chain, additive migration, unit/API tests, static security checks, real Windows PostgreSQL/Redis runtime verification, worker delivery, cleanup, and canonical evidence document all pass. A negative MFA proof remains distinct from the positive provider-MFA success proof. The workstream must not claim full Phase 2, production readiness, or Phase 3 readiness.

## References

1. [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md)
2. [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md)
3. [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)
4. [`ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md`](ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md)
5. [`AUTHORIZATION_ADMIN_MFA_OPERATION_PLAN.md`](AUTHORIZATION_ADMIN_MFA_OPERATION_PLAN.md)
6. [`INTEGRATION_TEST_TOPOLOGY.md`](INTEGRATION_TEST_TOPOLOGY.md)
7. [`AUDIT_EVENT_FOUNDATION_DECISION.md`](AUDIT_EVENT_FOUNDATION_DECISION.md)
8. [`engineering-governance/SKILL.md`](../../skills/engineering-governance/SKILL.md)
