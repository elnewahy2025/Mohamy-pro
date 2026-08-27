# Phase 2 Invitation and Administrative Onboarding Evidence

**Workstream:** Invitation and administrative onboarding

**Evidence status:** **IMPLEMENTED / STATICALLY VERIFIED / WINDOWS RUNTIME VERIFIED FOR THIS INVITATION SLICE**

**Phase status:** Phase 2 remains open. Phase 3 is prohibited. Production readiness is not established.

## Scope of this record

This record covers the application-owned invitation lifecycle implemented on branch `phase2/legacy-tenant-boundaries`. The invitation runtime gate below is qualified by a real Windows PostgreSQL/Redis/Keycloak/API/worker run. This record does not claim overall Phase 2 completion or production readiness.

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
| Database boundary     | Additive migrations only. Invitation acceptance uses a narrowly validated transaction-local context with token-bound lookup/invalidation hashes, accepting user, target tenant, and inviter membership selector. The applied returning-visibility policy correction is constrained by the validated acceptance context; no `BYPASSRLS` or broad global visibility is introduced. |
| Worker observability  | Invitation lifecycle events are allowlisted in AuditService, the audit outbox handler, and bounded metrics labels.                                                                                                                                                                                  |

## Executed local verification

The following local checks were executed in the sandbox checkout after the source repair:

| Check | Result |
| --- | --- |
| `pnpm --filter api run build` | **PASS**, exit code 0 |
| `pnpm --filter api exec jest --runInBand --detectOpenHandles` | **PASS**, exit code 0, 34 suites / 176 tests |
| `pnpm --filter api exec jest src/auth/invitation.service.spec.ts src/common/http/phase2-business.interceptor.spec.ts --runInBand` | **PASS**, exit code 0, 19 tests |
| `pnpm --filter api exec eslint src/auth/invitation.service.ts src/auth/invitation.service.spec.ts src/common/http/phase2-business.interceptor.ts src/common/http/phase2-business.interceptor.spec.ts` | **PASS**, exit code 0, 0 errors / 30 warnings |
| `pnpm --filter api exec prisma validate` | **PASS**, exit code 0 |
| `node --check backend/api/scripts/phase2-invitation-runtime-check.mjs` | **PASS**, exit code 0 |
| `git diff --check` | **PASS**, exit code 0 |
| Sensitive-log pattern scan excluding protected logs | **0 matching lines** |

`pnpm --filter api exec prisma format --check` was also executed and returned nonzero because pre-existing Prisma files were unformatted; no auto-format was run and no unrelated schema file was overwritten. The unit and focused tests cover token hashing, one-time issuance, identity mismatch, unknown persisted scope rejection, fail-closed limiter behavior, expired transition audit ordering, controller actor/session binding, global acceptance idempotency scope, token-free idempotency replay, immediate acceptance-context rebinding, and atomic acceptance sequencing.

## Qualified Windows runtime gate

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

These markers are qualified Windows evidence from the run recorded below. They qualify the invitation/onboarding slice only; they do not establish overall Phase 2 completion.

## Latest runtime evidence and source corrections

The successful Windows verifier output was submitted after the published `f2dcb620` repair request. The available runtime evidence contains the complete invitation marker set below. The chat record does not include the separate synchronization command output, so migration-count and build command exit codes are not restated as independently observed evidence here; the runtime result itself is the authoritative acceptance evidence for this slice. The existing local Keycloak MFA configuration had already been positively established for the protected creation path. The qualified markers were:

```text
invitation_create_status=PASS|hashed_token_returned_once=true|admin_policy=true
invitation_accept_status=PASS|membership_active=true|role_assigned=true|token_replay_idempotent=true
invitation_identity_mismatch_status=PASS|http=403|state_unchanged=true
invitation_revoke_status=PASS|state=REVOKED
invitation_expiry_status=PASS|http=409|state=EXPIRED|audit_event=true
invitation_outbox_status=PASS|events_processed=true
phase2_invitation_runtime_result=PASS
invitation_fixture_cleanup_status=PASS|active_fixture_tenants=0|active_fixture_memberships=0|audit_append_only=true
```

This is positive evidence that the provider-MFA configuration satisfies the application’s configured `mfa` AMR contract for protected invitation creation and that the complete verifier path for this invitation slice passed: creation, ordinary acceptance, role assignment, token replay idempotency, identity mismatch protection, revocation, expiry terminalization, audit/outbox processing, and cleanup. It does not establish overall Phase 2 completion.

The expiry failure was resolved through two narrowly scoped published changes. Commit `ddb9d7d7` rebinds the token-bound acceptance context immediately before expiry terminalization and proves that ordering in focused tests. Commit `f2dcb620` adds an additive migration that extends `Invitation_acceptance_lookup` to recognize the transaction-local invalidated hash for the post-update row, while retaining the required acceptance context. It does not alter the acceptance `UPDATE` policy, tenant isolation, grants, `BYPASSRLS`, or applied migration history.

The same implementation retains bounded expiry-stage diagnostics and fail-closed lost-race handling. The idempotency replay path returns the stored response through Nest’s normal response pipeline rather than manually writing JSON and returning `EMPTY`; local focused tests cover the original controlled exception and replay behavior. The Windows run showed no expiry-stage error and produced the required controlled 409/audit/outbox markers.

## Remaining qualification

The invitation/onboarding runtime workstream is qualified as **PASS for the covered Windows slice**. Remaining Phase 2 work is outside this slice: persisted inviter-authority revalidation at acceptance must still be reviewed and evidenced, as must the broader authorization matrix, API contracts/generated client, frontend authentication and tenant switching with English/Arabic RTL/LTR behavior, broader abuse and identity-data lifecycle controls, full integration topology/CI, and the supported Linux KMS/object-storage deployment boundary. Phase 2 remains open and Phase 3 remains prohibited.

## References

1. [`docs/phase2/INVITATION_ONBOARDING_IMPLEMENTATION_PLAN.md`](docs/phase2/INVITATION_ONBOARDING_IMPLEMENTATION_PLAN.md)
2. [`docs/phase2/PHASE2_IMPLEMENTATION_PLAN.md`](docs/phase2/PHASE2_IMPLEMENTATION_PLAN.md)
3. [`docs/phase2/PHASE2_REMAINING_WORKSTREAM_AUDIT.md`](docs/phase2/PHASE2_REMAINING_WORKSTREAM_AUDIT.md)
4. [`docs/phase2/ACCOUNT_LIFECYCLE_DECISION.md`](docs/phase2/ACCOUNT_LIFECYCLE_DECISION.md)
5. [`docs/phase2/ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md`](docs/phase2/ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md)
6. [`docs/phase2/TENANT_MEMBERSHIP_SWITCHING_DECISION.md`](docs/phase2/TENANT_MEMBERSHIP_SWITCHING_DECISION.md)
7. [`docs/phase2/AUTHORIZATION_MFA_RUNTIME_EVIDENCE.md`](docs/phase2/AUTHORIZATION_MFA_RUNTIME_EVIDENCE.md)
8. [`docs/phase2/AUTHORIZATION_ADMIN_MFA_OPERATION_PLAN.md`](docs/phase2/AUTHORIZATION_ADMIN_MFA_OPERATION_PLAN.md)
9. [`docs/phase2/INTEGRATION_TEST_TOPOLOGY.md`](docs/phase2/INTEGRATION_TEST_TOPOLOGY.md)
10. [`skills/engineering-governance/SKILL.md`](skills/engineering-governance/SKILL.md)
11. [`skills/persistent-computing/SKILL.md`](skills/persistent-computing/SKILL.md)
12. [`skills/automation-and-scheduling/SKILL.md`](skills/automation-and-scheduling/SKILL.md)
