# Authorization and MFA Assurance Runtime Evidence

**Workstream:** Phase 2 authorization policy, MFA assurance, and restricted-role RLS boundary.

**Evidence status:** **PASS for the bounded authorization policy/RLS runtime slice; full authorization/MFA workstream remains open.**

**Phase status:** Phase 2 remains open. Phase 3 has not started. This document is an evidence record, not a Phase 2 completion or production-readiness declaration.

## Scope and evidence boundary

The runtime campaign was executed on the protected Windows 11 and Docker Desktop environment using the real Keycloak OIDC flow, the actual API, the actual worker, the existing database, and the restricted PostgreSQL runtime role. Temporary fixture administration used the protected migration connection. The runtime role was verified by the campaign as non-superuser, non-`BYPASSRLS`, and able to log in without migration ownership or role-management privileges.

The campaign proves the server-side tenant-switch policy path, the allowlisted current-access projection, and the `GlobalRoleAssignment` RLS boundary. It does **not** by itself prove every future protected administrative route, invitation workflow, real Keycloak MFA challenge, frontend behavior, hosted CI, or supported production deployment boundary.

## Exact Windows runtime result

The user executed the published authorization verifier after synchronizing the branch and applying the existing migration state. The complete sanitized output was:

```text
authorization_oidc_status=PASS|pkce_s256=true|state_nonce_present=true
authorization_stale_fixture_cleanup_status=PASS|archived_tenants=2|retained_audit_events=2|audit_append_only=true
authorization_tenant_switch_status=PASS|server_validated=true|policy=CanSwitchTenant
authorization_access_status=PASS|tenant_role_visible=true|global_role_visible=true|permission_visible=true|allowlisted=true
authorization_global_role_catalog=select=true|rls_enabled=true|rls_forced=true|select_policy_count=1|superuser=false|bypassrls=false|canlogin=true
authorization_global_role_context=unscoped|helper=false
authorization_global_role_rls_query=unscoped|status=PASS|row_count=0
authorization_global_role_context=authenticated|helper=true
authorization_global_role_rls_query=authenticated|status=PASS|row_count=1
authorization_global_role_rls_status=PASS|own_assignment_visible=true|other_assignment_hidden=true|unscoped_hidden=true|visible_row_count=1|enabled=true|forced=true
authorization_session_cleanup_status=PASS|logout=204
authorization_fixture_cleanup_status=PASS|audit_retained=1|audit_append_only=true|active_fixture_tenants=0|active_fixture_memberships=0|outbox_residue=0|idempotency_residue=0
phase2_authorization_runtime_result=PASS
```

The two retained audit-event counts from stale fixtures are immutable historical evidence and are not removable residue. The final fixture cleanup retained one newly generated tenant-scoped audit event, removed all verifier-owned removable outbox and idempotency residue, archived the temporary tenant and membership, and verified zero active fixture state. This is consistent with the append-only audit decision and is not equivalent to deleting audit history.

## Requirement-to-evidence matrix

| Requirement                                                                | Source                                                                                                                                   | Implementation                                                                                                                                      | Test or runtime evidence                                                                                | Status                                                                        |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Backend policy evaluation is named and server-authoritative                | [`AUTHORIZATION.md`](../phase0/AUTHORIZATION.md); [`AUTHORIZATION_MFA_IMPLEMENTATION_PLAN.md`](AUTHORIZATION_MFA_IMPLEMENTATION_PLAN.md) | `backend/api/src/authorization/policy.evaluator.ts`, `authorization.service.ts`, `authorization.guard.ts`, `require-policy.decorator.ts`            | 28 API Jest suites / 145 tests passed before runtime; real tenant-switch marker names `CanSwitchTenant` | **PASS for implemented slice**                                                |
| Tenant switch is evaluated before atomic session mutation                  | `AUTHORIZATION_MFA_IMPLEMENTATION_PLAN.md`; tenant-switch decision                                                                       | `backend/api/src/auth/membership.service.ts` calls the named policy before compare-and-set context update                                           | `authorization_tenant_switch_status=PASS                                                                | server_validated=true                                                         | policy=CanSwitchTenant` | **PASS** |
| Current access is an allowlisted server projection                         | Authorization implementation contract                                                                                                    | `backend/api/src/authorization/authorization.controller.ts` and `authorization.service.ts`                                                          | `authorization_access_status=PASS                                                                       | ...                                                                           | allowlisted=true`       | **PASS** |
| Global role assignments require a valid membership-selection context       | RLS tenant-enforcement decision; additive migration `20260826090000_phase2_global_role_assignment_rls`                                   | `GlobalRoleAssignment_authenticated_user_selection` policy and `app_membership_selection_context_is_valid()`                                        | Unscoped helper false; unscoped query row count zero; authenticated helper true                         | **PASS**                                                                      |
| Direct restricted runtime role has only required authorization read access | Least-privilege runtime design; additive migration `20260826100000_phase2_authorization_runtime_grants`                                  | Conditional `SELECT` grants on authorization tables; no write or ownership grant                                                                    | Catalog marker: `select=true`, `superuser=false`, `bypassrls=false`, `canlogin=true`                    | **PASS**                                                                      |
| Own global assignment is visible and another user’s assignment is hidden   | Authorization RLS migration                                                                                                              | Same RLS policy and fixture-specific verifier assertion                                                                                             | `own_assignment_visible=true                                                                            | other_assignment_hidden=true                                                  | visible_row_count=1`    | **PASS** |
| Global-role table is forced through RLS                                    | RLS decision                                                                                                                             | `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY`                                                                                                   | `rls_enabled=true                                                                                       | rls_forced=true                                                               | select_policy_count=1`  | **PASS** |
| OIDC and session cleanup remain functional with authorization integration  | Authentication architecture decision                                                                                                     | Existing OIDC/session flow and authorization module wiring                                                                                          | `authorization_oidc_status=PASS`; logout `204`                                                          | **PASS for covered flow**                                                     |
| MFA assurance is persisted and evaluated fail-closed in source             | Account lifecycle decision; authorization/MFA implementation plan                                                                        | `SessionService` persists provider `acr`/`amr` and `mfaVerifiedAt`; `MfaAssuranceService` and evaluator reject missing/stale/insufficient assurance | Unit tests cover missing, wrong, stale, and valid claims; local static tests passed                     | **PASS in unit/source coverage; real sensitive-route MFA runtime UNVERIFIED** |
| Append-only audit records are not deleted by verifier cleanup              | Audit-event foundation decision                                                                                                          | Verifier removes removable dependent residue and preserves current audit records                                                                    | `audit_append_only=true`; `audit_retained=1`; cleanup PASS                                              | **PASS for verifier cleanup design**                                          |
| Temporary fixture recovery is bounded                                      | Engineering governance and runtime verifier design                                                                                       | Stale cleanup filters only the verifier’s own fixture name/slug prefix and preserves audit records                                                  | `archived_tenants=2`; final active fixture counts zero                                                  | **PASS for bounded verifier recovery**                                        |

## Static verification record

The affected implementation was inspected and connected through the Nest module graph. The local static gate executed on the authorization implementation before the Windows campaign reported **28 Jest suites and 145 tests passed**, successful Nest build, successful Prisma schema validation, zero ESLint errors with warnings only, successful Prettier checks, successful Node syntax checks, and successful `git diff --check`. The final verifier-only revisions were separately formatted, syntax-checked, and diff-checked before publication.

The final published runtime-verifier commit is `0f13bb81` (`test(phase2): diagnose authorization RLS boundary`). The branch also contains the additive authorization RLS/grant migrations and the authorization implementation commits preceding it. The working tree preserves the unrelated Gemini/checkpoint files unstaged.

## Accepted conclusion

The following bounded claims are supported by real runtime evidence:

> **The server-authoritative tenant-switch policy path and allowlisted access projection work through the real API.**

> **The restricted PostgreSQL runtime role enforces the intended GlobalRoleAssignment boundary: unscoped reads return zero rows, the authenticated fixture assignment is visible, another user’s assignment is hidden, and the table is RLS-enabled and forced.**

> **The verifier now performs append-only-compatible cleanup and proves zero removable fixture residue without deleting current audit events.**

The following claims remain unsupported and are deliberately not made:

> **Full authorization/MFA workstream complete:** not established. A real protected administrative operation exercising provider MFA/step-up is still required by the account-lifecycle decision and will be tied to the administrative onboarding/invitation surface.

> **Full Phase 2 complete:** not established. Invitation/onboarding, generated contracts, bilingual frontend workflows, abuse and identity-data lifecycle controls, complete integration topology/CI, and the supported Linux/KMS/object-storage/TLS deployment boundary remain open.

> **Production ready:** not established. The Windows Docker environment remains a development/verification environment.

## References

1. [`AUTHORIZATION.md`](../phase0/AUTHORIZATION.md)
2. [`AUTHORIZATION_MATRIX.md`](../phase0/AUTHORIZATION_MATRIX.md)
3. [`AUTHORIZATION_MFA_IMPLEMENTATION_PLAN.md`](AUTHORIZATION_MFA_IMPLEMENTATION_PLAN.md)
4. [`ACCOUNT_LIFECYCLE_DECISION.md`](ACCOUNT_LIFECYCLE_DECISION.md)
5. [`RLS_TENANT_ENFORCEMENT_DECISION.md`](RLS_TENANT_ENFORCEMENT_DECISION.md)
6. [`AUDIT_EVENT_FOUNDATION_DECISION.md`](AUDIT_EVENT_FOUNDATION_DECISION.md)
7. [`PHASE2_REMAINING_WORKSTREAM_AUDIT.md`](PHASE2_REMAINING_WORKSTREAM_AUDIT.md)
8. [`engineering-governance/SKILL.md`](../../skills/engineering-governance/SKILL.md)
