# Phase 2 Assessment of the Additional Audit/RLS Review

**Status:** Review analyzed completely; no new database, password, protected-environment, grant, or RLS action is justified by the review alone.

## Executive decision

The supplied review is technically strong and agrees with the repository evidence on the most important security decisions: the original global `AuditEvent` failure was caused by PostgreSQL `INSERT ... RETURNING` visibility under RLS; the narrow `tenantId IS NULL` global SELECT-policy correction is the correct source-consistent migration; `REFERENCES` must not be granted blindly; RLS must not be weakened; the runtime role must remain non-owner and `NOBYPASSRLS`; and the real tenant-switch API mutation must not be skipped.

One material statement is stale relative to the latest Windows evidence. The review says the dual-client verifier has not yet been runtime-proven. That was true before the run that emitted:

```text
phase2_reliability_fixture_connection=admin_migration_url|runtime_assertions=database_url
phase2_reliability_cleanup_status=PASS|audit_residue=0|outbox_residue=0|active_fixture_tenants=0|active_fixture_memberships=0|active_fixture_contexts=0
phase2_reliability_runtime_result=FAIL|stage=real_api_audit_mutation|error_class=Error
```

That run proves that the verifier successfully connected to both intended paths, created its fixtures with the administrative migration connection, reached the real API mutation using the restricted runtime path, and cleaned up with zero residue. It does not prove the entire verifier or reliability workstream is accepted, but it does prove the dual-client fixture separation for that run.

## Claim-by-claim assessment

| Review claim                                                                                 | Decision                              | Evidence-based assessment                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The original global OIDC `AuditEvent` failure was an `INSERT ... RETURNING`/SELECT-RLS issue | Accepted                              | The P2039/42501 AuditEvent failure disappeared after the narrow global SELECT-policy correction, and the verifier progressed beyond authenticated session creation.                                                                 |
| Prisma `create()` needs returned-row visibility                                              | Accepted                              | It matches the observed migration result and PostgreSQL row-security behavior for a data-modifying statement with `RETURNING`.                                                                                                      |
| The global correction with `app.global_operation=true AND tenantId IS NULL` is narrow        | Accepted                              | It permits only global rows under the trusted global context and does not make tenant-scoped rows visible through that clause.                                                                                                      |
| `REFERENCES=false` requires a grant                                                          | Rejected                              | The inventory fact does not establish a runtime defect; no `REFERENCES` grant is justified.                                                                                                                                         |
| Trigger `EXECUTE` must be granted for ordinary DML                                           | Rejected                              | The existing trigger is present and the supplied evidence does not establish a missing runtime trigger-function privilege.                                                                                                          |
| The restricted role has the shown tenant-switch DML                                          | Strongly supported                    | The explicit matrix and catalog inventory cover the source-audited API path; this does not generalize to unreviewed future business tables.                                                                                         |
| The verifier must use an administrative connection for fixtures                              | Accepted                              | The restricted role intentionally has no tenant-creation privilege; the verifier now separates fixture administration from runtime assertions.                                                                                      |
| The dual-client verifier is not runtime-proven                                               | Stale                                 | The later Windows run reached `real_api_audit_mutation` and cleanup passed with zero residue, proving the fixture separation executed successfully at runtime. Full reliability remains unproven.                                   |
| The next diagnostic belongs in `MembershipService`                                           | Reasonable fallback, not yet required | The verifier already has a bounded HTTP/envelope/error-code diagnostic in published commit `b1614aa5`. Run it first. Add a service-stage marker only if that bounded verifier marker is insufficient to identify the failing stage. |
| A broad exception-filter diagnostic should be added immediately                              | Not justified                         | It would widen logging scope before the existing bounded API mutation marker is captured. A narrowly scoped service diagnostic is preferable only if the current marker returns no actionable safe distinction.                     |
| No new database migration should be applied for this blocker                                 | Accepted                              | The AuditEvent RETURNING migration is already applied and corrected the original failure. The current blocker must be diagnosed through the real tenant-switch path, not by adding speculative schema changes.                      |
| Phase 2 can be closed                                                                        | Rejected                              | The real API tenant-switch mutation and all subsequent restricted-role reliability assertions remain incomplete.                                                                                                                    |
| Production readiness can be claimed                                                          | Rejected                              | Phase 2 remains open and the future Linux KMS/object-storage/TLS/operations boundary remains mandatory.                                                                                                                             |

## Important correction to the review’s wording about foreign keys

The review correctly rejects an unproven `REFERENCES` grant. Its explanation should be read carefully: the fact that PostgreSQL RI trigger source contains ACL-related logic does not, by itself, establish a general runtime `REFERENCES` requirement for an already-created foreign key. The repository’s own evidence is stronger here: effective `AuditEvent INSERT=true`, referenced-table SELECT privileges are true, the three foreign keys exist, and the current failure moved away from the global AuditEvent insert after the RETURNING correction. No FK grant should be added unless a future bounded diagnostic proves a specific missing privilege.

## Current verified boundary

The following facts are now established:

1. The runtime role is `superuser=false|bypassrls=false`.
2. AuditEvent RLS is `enabled=true|forced=true`.
3. The global OIDC AuditEvent RETURNING boundary has been corrected and the migration was applied.
4. The pre-insert transaction probe showed `global_operation=true`, an operation identifier, no tenant context for the global login event, and effective AuditEvent INSERT.
5. The administrative inventory showed the expected role attributes, no target-role ownership or membership, expected policies, no restrictive INSERT policy, append-only trigger, and effective referenced-table SELECT privileges.
6. The dual-connection verifier reached the real API tenant-switch mutation and cleanup passed with zero fixture residue.

The following facts are not established:

1. The actual tenant-switch API request returns HTTP 200 with a valid success envelope under the restricted runtime role.
2. The tenant-scoped AuditEvent and linked OutboxMessage are created by that real API mutation.
3. Tenant read isolation, cross-tenant write denial, append-only behavior, retention/legal hold, retry/dead-letter, and same-session CAS concurrency pass under the restricted runtime role.
4. The complete Phase 2 audit/reliability workstream is accepted.

## Correct next procedure

The correct procedure is evidence-first and does not require Gemini or another speculative grant at this moment.

1. Keep the database, password, protected environment, and migration state unchanged.
2. Stop the host API and worker processes manually with Ctrl+C before any synchronization.
3. Synchronize the published verifier diagnostic at commit `b1614aa5` using the required status check and `git pull --ff-only` sequence.
4. Run the required frozen install, Prisma generation, migration deploy, build, syntax, and formatting gates.
5. Start the API and worker as host processes from fresh PowerShell windows so the published verifier and protected runtime configuration are active.
6. Run one reliability verifier execution.
7. Capture only the bounded markers:

```text
audit_rls_role_diagnostic=...
phase2_reliability_fixture_connection=...
audit_api_mutation_diagnostic=...
phase2_reliability_cleanup_status=...
phase2_reliability_runtime_result=...
```

8. Interpret `audit_api_mutation_diagnostic` before changing anything. If it reports HTTP 200 and a true success field, continue with the verifier’s existing RLS/outbox/concurrency assertions. If it reports a controlled business error code, diagnose that exact envelope path. If it reports HTTP 5xx with no safe error code, add one narrowly scoped allowlisted stage marker in `MembershipService` around the existing lookup, context bind, AppSession update, AuditEvent call, and Outbox call; do not add a broad raw-error logger.

The additional review’s warning not to skip `real_api_audit_mutation` is correct. This is the first proof that the restricted application role can perform the actual tenant-switch operation and create its tenant-scoped audit/outbox records. Skipping it would leave the central Phase 2 boundary unverified.

## Prohibited actions

Do not grant `REFERENCES`, `ALL`, or broad future-object privileges. Do not make the runtime role the owner, grant `BYPASSRLS`, disable forced RLS, use the migration connection in API/worker runtime, run synthetic database writes as proof of the API path, edit migration history, reset or recreate the database, delete persistent volumes, alter protected passwords or connection strings through chat, or infer later PASS markers from a partial run.

## Qualified status

**Phase 2: OPEN.** The original global AuditEvent RETURNING/RLS failure is corrected and the restricted-role verifier topology has now executed through fixture setup to the real API mutation. The real tenant-switch mutation and the subsequent restricted-role audit, outbox, tenant-isolation, retention, retry/dead-letter, and concurrency evidence remain incomplete. **Production readiness is not established.**
