# Phase 2 Invitation and Administrative Onboarding Evidence

**Workstream:** Invitation and administrative onboarding

**Evidence status:** **IMPLEMENTED / STATICALLY VERIFIED / WINDOWS RUNTIME UNVERIFIED**

**Phase status:** Phase 2 remains open. Phase 3 is prohibited. Production readiness is not established.

## Scope of this record

This record covers the application-owned invitation lifecycle implemented on branch `phase2/legacy-tenant-boundaries`. It does not claim acceptance of the workstream until the real Windows PostgreSQL/Redis/Keycloak/API/worker runtime verifier passes and the remaining provider-MFA and contract gates are addressed.

## Implemented boundary

| Area                  | Implemented control                                                                                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invitation creation   | Tenant-scoped, authenticated administration route guarded by `CanManageMembership`, provider-MFA assurance, CSRF/origin protection, strict DTO validation, and idempotency.                                                                                                                         |
| Token handling        | 32 random bytes encoded as an opaque 43-character token; SHA-256 hash persisted; raw token returned only in the immediate issuance response.                                                                                                                                                        |
| Idempotency           | Invitation acceptance is global-scoped because the target tenant is discovered from the token. Invitation creation idempotency replay records are sanitized so the raw issuance token is not persisted or replayed.                                                                                 |
| Identity binding      | Exactly one normalized intended email or exact provider subject is required at issuance. Acceptance derives provider subject and provider-verified normalized email from the trusted authenticated session; browser identity fields are not authoritative.                                          |
| Acceptance            | Token, tenant, inviter membership, role, scope, user, and existing-membership checks occur before membership activation. Membership, role assignment, invitation terminalization, audit, and outbox linkage use one controlled transaction.                                                         |
| Role and scope        | Only existing tenant-scoped roles are accepted. Global roles are excluded. Organization, branch, department, and team scope is validated against the target tenant, persisted on `MembershipRole.assignmentScope`, loaded into authorization snapshots, and rejected when unknown keys are present. |
| Revocation and expiry | Pending invitations can be revoked in tenant context. Expired pending invitations are terminalized with a replacement hash and redacted audit/outbox evidence; the controlled error is raised only after the transaction callback returns so the terminal evidence can commit.                      |
| Abuse control         | Redis Lua counter limits acceptance attempts per invitation fingerprint and source-IP hash to the validated one-hour window and maximum. Redis failure is fail-closed. Raw tokens, provider subjects, and email values are excluded from runtime markers and audit metadata.                        |
| Database boundary     | Additive migration only. Invitation acceptance uses a narrowly validated transaction-local context with token-bound lookup/invalidation hashes, accepting user, target tenant, and inviter membership selector. No `BYPASSRLS` or broad global visibility is introduced.                            |
| Worker observability  | Invitation lifecycle events are allowlisted in AuditService, the audit outbox handler, and bounded metrics labels.                                                                                                                                                                                  |

## Executed local verification

The following checks were executed in the sandbox checkout after the implementation changes:

| Check                                                        | Result                          |
| ------------------------------------------------------------ | ------------------------------- |
| API build: `pnpm --filter api run build`                     | **PASS**                        |
| Complete API Jest: `pnpm --filter api exec jest --runInBand` | **PASS — 34 suites, 173 tests** |

| Invitation-focused tests | **PASS**, including service, acceptance, controller, tenant-context, and interceptor tests |
| ESLint without auto-fix | **PASS with 0 errors and 45 warnings**. The warnings are reported and remain distinct from errors; no auto-fix was run. |
| Prisma schema validation | **PASS** |
| Runtime verifier syntax: `node --check backend/api/scripts/phase2-invitation-runtime-check.mjs` | **PASS** |
| `git diff --check` | **PASS** |
| Sensitive-log pattern scan excluding protected logs | **0 matching lines** |

The unit and focused tests include token hashing, one-time issuance, identity mismatch, unknown persisted scope rejection, fail-closed limiter behavior, expired transition audit ordering, controller actor/session binding, global acceptance idempotency scope, token-free idempotency replay, and atomic acceptance sequencing. These are not substitutes for real Windows runtime evidence.

## Windows runtime gate still required

The runtime verifier is registered as `pnpm --filter api run db:phase2:invitations` and requires two real Keycloak test identities: one tenant administrator and one acceptance target. The credentials must be supplied through protected Windows environment variables; they must never be pasted into chat, committed, logged, or included in evidence.

The verifier is designed to prove real invitation creation, token-free persisted idempotency replay, acceptance, active membership and role assignment, exact-token replay behavior, identity mismatch without mutation, revocation, expiry terminalization, worker processing, restricted-role visibility, audit retention, and fixture cleanup. It uses `MIGRATION_DATABASE_URL` only for isolated fixture setup/cleanup and `DATABASE_URL` for restricted runtime assertions. It does not delete append-only AuditEvent rows.

The verifier now reports only an allowlisted stage, an allowlisted fixture substage when applicable, JavaScript error class, uppercase error code, SQLSTATE, and SQL category on failure. It never prints usernames, passwords, provider authorization URLs, authorization codes, cookies, raw tokens, connection strings, or database error messages. This diagnostic was added because the prior generic `error_class=Error` output did not identify whether a failure occurred during database connection, either login, fixture provisioning, tenant switching, invitation mutation, outbox delivery, or cleanup. A bounded failure has this form: `phase2_invitation_runtime_result=FAIL|stage=...|substage=...|error_class=...|error_code=...|sqlstate=...|sqlcategory=...`.

For invitation creation specifically, the verifier extracts only `payload.error.code` when the HTTP response is 403 and accepts only the source-established codes `MFA_STEP_UP_REQUIRED`, `AUTHORIZATION_DENIED`, and `FORBIDDEN`; every other response code or malformed payload becomes `UNKNOWN`. The bounded verifier error is therefore `INVITATION_CREATE_HTTP_403_CODE_<allowlisted-code>`. The response body, message, details, headers, cookies, identifiers, tokens, provider values, and session contents are not emitted.

A successful run must include these markers, with the actual values produced by the Windows environment:

```text
invitation_create_status=PASS|hashed_token_returned_once=true|admin_policy=true
invitation_accept_status=PASS|membership_active=true|role_assigned=true|token_replay_idempotent=true
invitation_identity_mismatch_status=PASS|http=403|state_unchanged=true
invitation_revoke_status=PASS|state=REVOKED
invitation_expiry_status=PASS|http=409|state=EXPIRED|audit_event=true
invitation_outbox_status=PASS|events_processed=true
invitation_fixture_cleanup_status=PASS|active_fixture_tenants=0|active_fixture_memberships=0|audit_append_only=true
phase2_invitation_runtime_result=PASS
```

These markers are **not yet evidence** because the verifier has not yet been executed against the user’s Windows topology.

## Latest diagnostic and source correction

The Windows runtime sequence first passed the fixture provisioning and tenant-switch boundaries. After the approved local Keycloak changes—an enrolled OTP credential for `phase2-invitation-admin`, the OTP execution reference `mfa`, and the built-in Authentication Method Reference mapper on `mohamy-api-dedicated`—the same real OIDC/PKCE verifier produced the following progression:

```text
invitation_create_status=PASS|hashed_token_returned_once=true|admin_policy=true
invitation_accept_status=PASS|membership_active=true|role_assigned=true|token_replay_idempotent=true
invitation_identity_mismatch_status=PASS|http=403|state_unchanged=true
invitation_revoke_status=PASS|state=REVOKED
phase2_invitation_runtime_result=FAIL|stage=invitation_expiry_accept|substage=none|error_class=Error|error_code=INVITATION_EXPIRE_ACCEPT_HTTP_500_CODE_INTERNAL_SERVER_ERROR|sqlstate=none|sqlcategory=unknown
invitation_fixture_cleanup_status=PASS|active_fixture_tenants=0|active_fixture_memberships=0|audit_append_only=true
```

This is positive evidence that the provider-MFA configuration satisfies the application’s configured `mfa` AMR contract for the protected invitation-creation operation, and that ordinary acceptance, token replay idempotency, identity mismatch protection, and revocation passed in the same run. It is not evidence that the complete invitation workstream has passed.

Source review identified and corrected the earlier acceptance assertion defect in the verifier, not in the invitation transaction: after acceptance, the verifier queried `Membership` and `MembershipRole` through the restricted runtime connection without establishing a transaction-local tenant, user, and target-membership context. With RLS forced, that query could correctly return no visible row even though the application transaction committed the active membership. The verifier now binds the accepted tenant, target user, and returned target membership inside an explicit RLS transaction before asserting the active membership and role. The assertion commits before evaluating the result and rolls back only on database failure; it does not bypass RLS or alter production authorization behavior.

The new expiry diagnostic shows that the service’s intended `InvitationNotActionableError` path is being serialized as an HTTP 500 in the running Windows application. The verifier now preserves only the allowlisted response code `INTERNAL_SERVER_ERROR` for this failure; it never emits the response body or raw error details. The service-level tests already require terminal expiry, audit recording, and a controlled `INVITATION_NOT_ACTIONABLE` exception, so the remaining defect is outside that unit-level contract—most likely in the HTTP/interceptor completion path—but it requires exact source/runtime verification before any fix is proposed.

No database migration, privilege, application-policy, RLS-policy, or Keycloak change is part of the verifier corrections. The runtime workstream remains unaccepted until the expiry response is corrected and the remaining outbox, RLS, and cleanup criteria pass.

## Remaining qualification

The acceptance gate remains open until the expiry-acceptance HTTP response is corrected, the Windows runtime run passes after synchronization, and the output is reviewed. The latest run provides positive provider-MFA evidence for the protected invitation-creation operation and passes ordinary acceptance, replay idempotency, identity mismatch, and revocation. This does not by itself close the complete authorization/MFA workstream or the remaining expiry, outbox, RLS, and cleanup gates.

The next safe operation is a source-grounded correction for the expiry-acceptance HTTP 500 followed by one Windows runtime rerun. Before that runtime run, the local Keycloak configuration must be rechecked in the `mohamy` realm: the existing `mohamy-api` client, its `mohamy-api-dedicated` scope with `mohamy-api-amr` of type Authentication Method Reference, the OTP execution reference `mfa`, and the enrolled OTP credential for `phase2-invitation-admin`; no Keycloak change is indicated by the latest evidence. Before any source synchronization, both API and worker terminals must be stopped. The user must run `git status --short` from the actual repository root and preserve all protected modifications and untracked files, then use `git pull --ff-only`, frozen pnpm installation, Prisma client generation, migration deployment, and API build. The Windows database and Docker Desktop volumes must remain untouched; no new migration is required for the verifier correction.

## References

1. [`INVITATION_ONBOARDING_IMPLEMENTATION_PLAN.md`](INVITATION_ONBOARDING_IMPLEMENTATION_PLAN.md)
2. [`PHASE2_IMPLEMENTATION_PLAN.md`](PHASE2_IMPLEMENTATION_PLAN.md)
3. [`PHASE2_REMAINING_WORKSTREAM_AUDIT.md`](PHASE2_REMAINING_WORKSTREAM_AUDIT.md)
4. [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md)
5. [`ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md`](ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md)
6. [`TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](TENANT_MEMBERSHIP_SWITCHING_DECISION.md)
7. [`AUTHORIZATION_MFA_RUNTIME_EVIDENCE.md`](AUTHORIZATION_MFA_RUNTIME_EVIDENCE.md)
8. [`AUTHORIZATION_ADMIN_MFA_OPERATION_PLAN.md`](AUTHORIZATION_ADMIN_MFA_OPERATION_PLAN.md)
9. [`INTEGRATION_TEST_TOPOLOGY.md`](INTEGRATION_TEST_TOPOLOGY.md)
10. [`../../skills/engineering-governance/SKILL.md`](../../skills/engineering-governance/SKILL.md)
11. [`../../skills/persistent-computing/SKILL.md`](../../skills/persistent-computing/SKILL.md)
12. [`../../skills/automation-and-scheduling/SKILL.md`](../../skills/automation-and-scheduling/SKILL.md)
