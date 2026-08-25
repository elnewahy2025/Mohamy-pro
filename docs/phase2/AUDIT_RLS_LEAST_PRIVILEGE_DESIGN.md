# Phase 2 Audit RLS Least-Privilege Design

**Status:** Non-secret repository implementation, user-run restricted-role provisioning, and protected runtime cutover are complete. The source-confirmed additive AuditEvent RLS correction is published but has not yet been applied to the Windows database or runtime-verified. Phase 2 remains open.

**Scope:** Resolve the real PostgreSQL AuditEvent RLS runtime boundary failure without weakening RLS, changing protected Windows environment files, exposing credentials, or modifying existing database data. This document is Phase 2 only.

## Decision summary

The live runtime evidence establishes that the current application database connection has both `superuser=true` and `bypassrls=true`, while `AuditEvent` has row security enabled and forced. The cross-tenant visibility result therefore cannot be used to judge the policy predicate: PostgreSQL superusers and roles with `BYPASSRLS` bypass row-level security, and `FORCE ROW LEVEL SECURITY` does not override those attributes [1].

The permanent direction is a **dual-role runtime model**. The existing administrative connection remains responsible for controlled DDL and Prisma migrations. A separate non-owner application/worker LOGIN role must have `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, and `NOCREATEROLE`. The application and worker must connect with that restricted role so the existing tenant and dispatcher policies are actually evaluated. The existing RLS policies, append-only trigger, retention controls, and fail-closed context predicates must not be relaxed.

The agent has not read, printed, or changed any password, protected environment value, database URL, migration history, or Docker configuration. The user separately executed the approved out-of-band role provisioning, set the runtime-role password locally, and configured the protected runtime and migration connection values. Repository work remains limited to non-secret configuration selection, bounded diagnostics, fail-closed verification, documentation, explicit provisioning guidance, and the additive RLS correction migration described below.

## Bounded runtime evidence

The last Windows run produced the following safe markers:

```text
audit_rls_role_diagnostic=superuser=true|bypassrls=true|enabled=true|forced=true
audit_outbox_source_status=PASS|http=200|server_derived_context=true
audit_outbox_delivery_status=PASS|status=PROCESSED|attempts=1
audit_outbox_duplicate_status=PASS|job_states=completed,completed|attempts_unchanged=true|audit_count=1
audit_rls_diagnostic=same_tenant_visible|cross_tenant_visible
phase2_reliability_cleanup_status=PASS|audit_residue=0|outbox_residue=0|active_fixture_tenants=0|active_fixture_memberships=0|active_fixture_contexts=0
phase2_reliability_runtime_result=FAIL|stage=audit_rls_boundary|error_class=Error
```

The evidence proves that audit source creation, outbox delivery, duplicate suppression, and cleanup work in the current development topology. It also proves that the current connection bypasses RLS. It does **not** prove that the policy expressions are defective.

## Security and governance requirements

The following requirements remain mandatory for implementation, provisioning, and runtime acceptance:

| Requirement                                 | Decision                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Existing database and volumes               | Preserve; no reset, truncate, recreation, or destructive cleanup                                                                |
| RLS policies and `FORCE ROW LEVEL SECURITY` | Preserve; no weakening, removal, or bypass path                                                                                 |
| Administrative/migration access             | Keep separate from API/worker runtime access                                                                                    |
| Runtime role                                | Non-owner LOGIN with `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`                                                          |
| Credentials                                 | Provision interactively or through the user’s secret-management process; never in migrations, source, logs, or committed files  |
| Protected Windows configuration             | Do not edit automatically; updating the runtime connection string requires explicit user approval and user-managed secret entry |
| Migration history                           | Additive only if a schema change is proven necessary; role/password provisioning does not belong in a Prisma migration          |
| Evidence                                    | Runtime verifier must fail closed when the connection role has `superuser` or `BYPASSRLS`                                       |
| Phase scope                                 | Phase 2 only; no Phase 3 or production-readiness claim                                                                          |

## Proposed role separation

The current administrative role is used by the existing development database and is the only role that may be used for controlled migration administration. A new runtime role, referred to below as `mohamy_app` as a design name, must be provisioned outside the migration history. It must not own the tenant tables, audit table, functions, or schema, because table ownership grants powers that can bypass ordinary RLS enforcement and alter policy configuration. PostgreSQL documents that table owners normally bypass RLS, while `FORCE ROW LEVEL SECURITY` applies the policies to owners; the runtime role should nevertheless remain a non-owner so it cannot alter the security boundary [1].

The runtime role should receive only the privileges required by the API and worker. Because the current application uses many Prisma models, the final grant set must be generated from the actual schema and audited rather than copied as an unrestricted `GRANT ALL`. At minimum, the provisioning review must cover schema usage, explicit table DML privileges, sequence privileges where sequences exist, and execute privileges for the specific policy helper functions. Grants must not include `WITH GRANT OPTION`, role-management privileges, database creation, replication, or ownership.

Future-object privileges must be handled deliberately for objects created by the administrative role. PostgreSQL’s `ALTER DEFAULT PRIVILEGES` applies to future objects created by the specified target role and does not retroactively change existing objects [3]. This repository implementation intentionally does **not** add a blanket default grant: each future runtime table or helper function must receive a separately reviewed explicit grant. A generic default grant without a known `FOR ROLE` target would be insufficient if migrations create objects under another role.

The outbox worker must continue to use the repository’s existing named dispatcher context, `app.outbox_dispatcher`, and its current `app_outbox_dispatch_context_is_valid()` predicate. The proposed external-review text’s alternative `app.dispatch_context` name is not approved because it would diverge from the migration already applied to the database.

## Credential and connection handling

Role creation and password setting must not be placed in a Prisma migration. PostgreSQL role creation requires a sufficiently privileged administrative actor, and password-bearing SQL risks exposure through source control, shell history, CI output, or database logs [2]. The safe local process is an explicit, user-approved administrative/bootstrap operation that creates or verifies the runtime role without printing credentials, then sets its password through a protected interactive or secret-management path. The user must manage the protected API/worker connection configuration update; the agent must not read, print, or rewrite the existing connection string.

The API and worker runtime connection must use the restricted runtime role. Prisma migration deployment must use the administrative migration connection. The repository implementation now supports optional `MIGRATION_DATABASE_URL` selection in `prisma.config.ts`, falling back to `DATABASE_URL` to preserve the existing development and CI contract until a protected migration URL is supplied. The application runtime continues to consume only `DATABASE_URL`; no migration URL is loaded into runtime validation.

## Required implementation sequence

1. **Repository configuration audit.** Inspect the Prisma configuration, connection bootstrap, package scripts, deployment documentation, and existing Docker role ownership without reading protected environment values. Identify exactly which process uses the runtime connection and which process performs migrations.

2. **Non-secret provisioning design.** Define an additive, repeatable bootstrap mechanism that can create or verify the restricted role and apply explicit grants without embedding a password or connection string. It must not silently alter the existing administrative role. Any use of the administrative database session requires explicit user approval.

3. **Privilege and ownership inventory.** From an approved administrative session, collect only bounded booleans/counts and role-attribute results. Verify that the runtime role is a non-owner, has `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, and `NOCREATEROLE`, and has the required object privileges. Do not print role names, passwords, URLs, or raw database rows.

4. **Runtime connection cutover.** Update the protected API/worker connection configuration only through an explicitly approved user-managed process. Do not perform this step automatically and do not ask the user to paste any secret into chat.

5. **Verifier prerequisite.** The reliability verifier must emit a redacted role marker equivalent to `audit_rls_role_diagnostic=superuser=false|bypassrls=false|enabled=true|forced=true` and must stop with a bounded failure marker if either bypass attribute is true. It must not attempt to claim tenant-isolation evidence under a bypassing role.

6. **RLS and audit runtime campaign.** Under the restricted runtime role, verify same-tenant visibility, cross-tenant denial, cross-tenant write denial, append-only update/delete denial, retention purge eligibility, legal-hold protection, outbox delivery, duplicate suppression, retry/lease/dead-letter behavior, and cleanup. The verifier must emit bounded markers only and must fail if fixture residue remains.

7. **Concurrency campaign.** Under the restricted runtime role, run the server-side tenant-switch compare-and-set race against the same session and verify exactly one winner, one controlled conflict, no cross-tenant context leakage, and durable audit evidence.

## Explicitly rejected actions

The following actions are not approved:

- Adding a `CREATE ROLE ... PASSWORD 'placeholder...'` statement to a migration.
- Committing a password, full DATABASE_URL, or a secret-bearing connection string.
- Altering the existing runtime role in place before its ownership, migration, and privilege dependencies are inventoried.
- Granting unrestricted `ALL` privileges or grant options without a schema-derived review.
- Changing `app.outbox_dispatcher` to another context name.
- Removing `FORCE ROW LEVEL SECURITY`, changing tenant predicates, or adding permissive cross-tenant policies.
- Running the cross-tenant test with the known superuser/bypass role and treating it as evidence.
- Resetting, truncating, recreating, or deleting existing database data or volumes.
- Starting Phase 3, frontend implementation, or production deployment work.

## Acceptance criteria for the next runtime attempt

The next attempt may be called a valid RLS runtime verification only if all of the following are true:

| Criterion          | Required evidence                                                                     |
| ------------------ | ------------------------------------------------------------------------------------- |
| Role enforcement   | Runtime marker shows `superuser=false` and `bypassrls=false`                          |
| Policy state       | `enabled=true` and `forced=true` for `AuditEvent`                                     |
| Same-tenant read   | Audit row visible under its server-bound tenant context                               |
| Cross-tenant read  | Same row hidden under another tenant context                                          |
| Cross-tenant write | Insert rejected by RLS or controlled privilege failure                                |
| Audit immutability | Unauthorized update/delete rejected; legal-hold row protected from purge              |
| Retention          | Eligible expired row purged only through named retention context                      |
| Outbox             | Delivery, duplicate suppression, retry/lease/dead-letter evidence present             |
| Concurrency        | One CAS winner and one controlled conflict with no context leak                       |
| Cleanup            | Zero active fixture tenants, memberships, contexts, audit residue, and outbox residue |

## Current status

```text
AUDIT_RLS_ROOT_CAUSE=SOURCE_CONFIRMED_GLOBAL_INSERT_RETURNING_LACKED_SELECT_POLICY
AUDIT_RLS_PERMANENT_FIX=PUBLISHED_NOT_APPLIED_TO_WINDOWS_DATABASE
AUDIT_RLS_ROLE_BOUNDARY=VERIFIED_SUPERUSER_FALSE_BYPASSRLS_FALSE
AUDIT_OUTBOX_SOURCE_DELIVERY_DUPLICATE_CLEANUP=PARTIAL_RUNTIME_PASS
AUDIT_RLS_ISOLATION=NOT_VERIFIED_UNDER_RESTRICTED_ROLE
TENANT_SWITCH_CONCURRENCY=NOT_EXECUTED
PHASE2=OPEN
PHASE3=NOT_STARTED
PRODUCTION_READINESS=NOT_ESTABLISHED
```

## References

[1]: https://www.postgresql.org/docs/current/ddl-rowsecurity.html "PostgreSQL Documentation: Row Security Policies"
[2]: https://www.postgresql.org/docs/current/sql-createrole.html "PostgreSQL Documentation: CREATE ROLE"
[3]: https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html "PostgreSQL Documentation: ALTER DEFAULT PRIVILEGES"

## Repository configuration audit findings

Before this repository change, Prisma CLI and the API/worker used one `DATABASE_URL` contract. The repository now keeps `backend/api/src/infrastructure/database/prisma.service.ts` on the validated runtime `DATABASE_URL` while `backend/api/prisma.config.ts` selects optional `MIGRATION_DATABASE_URL` for Prisma CLI and falls back to `DATABASE_URL` when it is absent. The API package exposes a bounded read-only administrative inventory command and does not validate or log the migration URL. The checked-in environment example and CI workflow remain compatible with one `DATABASE_URL`; a separate protected migration URL is optional and has not been configured or tested here.

This means the dual-role design cannot be implemented safely by adding a role-only migration or by silently changing one protected Windows value. The repository contract now specifies that Prisma CLI receives the optional protected administrative URL through `MIGRATION_DATABASE_URL`, while `PrismaService` receives the restricted runtime URL through `DATABASE_URL`. The fallback preserves existing CI and development behavior until CI has an approved secret/configuration path for the administrative connection; it does not make a superuser runtime acceptable for RLS evidence.

The current development compose baseline declares the database service with a development role and persistent volume, but the live role diagnostic shows that the actual connection role is superuser and bypasses RLS. This discrepancy must be resolved through a bounded administrative inventory on the existing database, without printing the role name or any secret. No in-place role alteration is approved before ownership, grants, role memberships, and migration-creator dependencies are inventoried.

### Approval gate

The user approved the non-secret repository contract and then completed the separate user-run provisioning gate: the runtime role `mohamy_app` was created with the approved restricted attributes, explicit grants were applied, its password was set interactively, and protected `DATABASE_URL`/`MIGRATION_DATABASE_URL` values were configured locally. The agent never received or printed the password, full connection strings, or environment-file contents. The database and volumes remain intact. The remaining gates are application of the new additive RLS migration through the protected migration connection and complete restricted-role runtime verification.

## Repository implementation and source-audited privilege matrix

The approved repository implementation is intentionally limited to non-secret controls. `backend/api/prisma.config.ts` now selects `MIGRATION_DATABASE_URL` when present and otherwise preserves the existing `DATABASE_URL` behavior for Prisma CLI operations. `PrismaService` and the API runtime environment contract continue to use `DATABASE_URL`; the application does not read or validate the migration URL. The reliability verifier now emits the bounded role/policy diagnostic and stops before creating fixtures when the runtime connection is a superuser, has `BYPASSRLS`, or lacks enabled and forced `AuditEvent` RLS. `backend/api/scripts/phase2-admin-inventory.mjs` is a read-only inventory command that emits only booleans and counts and labels whether the migration URL or runtime fallback was selected. None of these changes connects to the protected Windows database from this sandbox.

The source audit covers `SessionService`, `MembershipService`, `AuditService`, `OutboxService`, `OutboxWorker`, `IdempotencyService`, `HealthService`, `S3ObjectStorageService`, and `MetricsSnapshotService`. The latter now executes its outbox aggregation through the existing dispatcher context, so restricted-role RLS applies consistently to both worker and observability paths. The reliability verifier’s administrative fixture setup is deliberately separate from the application/worker privilege matrix: fixture creation, state restoration, and cleanup use the protected migration connection, while all runtime role and RLS assertions use the restricted `DATABASE_URL` connection. The current API/worker path requires the following explicit existing-object privileges:

| Object or object class          | Runtime privilege                        | Source-derived reason                                                                                      | RLS/context boundary                                               |
| ------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `public."User"`                 | `SELECT, INSERT, UPDATE`                 | Identity lookup/creation and lifecycle state transitions                                                   | Tenant or global operation context as used by the service          |
| `public."ExternalIdentity"`     | `SELECT, INSERT, UPDATE`                 | OIDC identity lookup and provider-subject mapping                                                          | Global operation context                                           |
| `public."AppSession"`           | `SELECT, INSERT, UPDATE`                 | Session creation, refresh, revocation, expiry, and tenant-context CAS                                      | Global operation context and server-bound session checks           |
| `public."Membership"`           | `SELECT`                                 | Membership state and tenant-switch validation                                                              | Tenant/membership selection predicates                             |
| `public."Tenant"`               | `SELECT`                                 | Tenant active/archive and membership resolution                                                            | Tenant-context predicate                                           |
| `public."AuditEvent"`           | `SELECT, INSERT, DELETE`                 | Audit write/read and retention purge; no update grant                                                      | Forced RLS, append-only trigger, named retention context           |
| `public."OutboxMessage"`        | `SELECT, INSERT, UPDATE`                 | Outbox creation, claim/lease, delivery, retry, dead-letter, and metrics                                    | Tenant/global context and `app.outbox_dispatcher`                  |
| `public."IdempotencyKey"`       | `SELECT, INSERT, UPDATE, DELETE`         | Reservation, replay, completion, retry release, and expiry purge                                           | Tenant/global context and named maintenance context                |
| `public."StorageObject"`        | `SELECT, INSERT, UPDATE`                 | Tenant-aware object metadata write, signed-download lookup, and soft-delete update                         | Forced RLS and tenant context                                      |
| Other current tables            | No grant                                 | No source-audited API/worker operation requires them in this slice                                         | Future work requires explicit review                               |
| Current UUID-backed sequences   | No grant required                        | The current Prisma models use UUID identifiers and the source audit found no sequence-backed runtime field | Reassess for any future schema change                              |
| Current policy helper functions | `EXECUTE` only on the five named helpers | PostgreSQL evaluates the existing context predicates during runtime DML                                    | Functions remain owned/admin-controlled; no blanket function grant |

The five explicitly named helper functions are `app_tenant_context_is_valid()`, `app_membership_selection_context_is_valid()`, `app_outbox_dispatch_context_is_valid()`, `app_global_operation_context_is_valid()`, and `app_idempotency_maintenance_context_is_valid()`. The append-only audit trigger is executed by PostgreSQL as part of the table operation and is not exposed as a runtime callable API. No grant includes `WITH GRANT OPTION`, ownership, role membership, replication, database creation, or role creation.

The unexecuted `backend/api/scripts/phase2-provision-mohamy-app.sql` template is an administrative-session artifact, not a migration. It creates or verifies the non-owner role with the approved restricted attributes, fails rather than silently taking ownership or accepting memberships, revokes pre-existing privileges from that target role, grants only the matrix above, and leaves password entry to an interactive protected administrative session. It does not alter the existing administrative role, RLS policies, data, volumes, migration history, or protected environment files. Future migrations must add separately reviewed explicit grants; this repository does not claim automatic future-object coverage.

## Source-confirmed AuditEvent RETURNING diagnosis and correction

The restricted-role runtime probe immediately before the real global login audit insert reported `global_operation=true`, `operation_id_present=true`, `tenant_id_present=false`, and `audit_insert_granted=true`. The administrative inventory reported two applicable permissive INSERT policies, zero restrictive INSERT policies, the expected global and tenant policy definitions, the append-only trigger, three foreign keys, and the required referenced-table SELECT privileges. The live API classified the failed operation as an RLS policy rejection with PostgreSQL SQLSTATE `42501` wrapped by Prisma P2039.

The remaining discrepancy is explained by the actual Prisma write semantics and PostgreSQL row-security planning. `transaction.auditEvent.create(...)` returns the inserted row, so the generated statement requires SELECT visibility for its `RETURNING` result. PostgreSQL’s row-security source adds SELECT policy checks to an INSERT when SELECT permission is required by the query; the existing global AuditEvent SELECT policy allowed only retention and outbox-dispatch contexts. The global authentication transaction therefore passed the INSERT `WITH CHECK` policy but failed the SELECT visibility check for the returned global row. This is a policy interaction defect, not a missing table grant, missing REFERENCES grant, missing trigger grant, or missing global context.

The minimal complete repository correction is published as:

```text
backend/api/prisma/migrations/20260825180000_audit_global_returning_rls_fix/migration.sql
```

That additive migration recreates only `AuditEvent_global_control_select` and adds the narrowly scoped condition `app.global_operation = 'true' AND tenantId IS NULL`, alongside the existing retention and outbox conditions. It preserves forced RLS, tenant isolation, append-only behavior, and the separation between administrative migrations and restricted runtime access. It does not grant privileges, change passwords, alter ownership, reset data, or add a bypass path. The migration has passed repository static validation but has not yet been applied to the Windows database.

## Remaining approval gates

The user-run role provisioning, interactive password setting, protected runtime cutover, and bounded administrative inventory are complete. The additive AuditEvent RETURNING policy migration is published and must be applied through the protected administrative migration connection with the API and worker stopped. The reliability verifier then requires both protected connections: `MIGRATION_DATABASE_URL` for administrative fixture setup/cleanup and `DATABASE_URL` for the restricted runtime role probe and every RLS assertion. The API/worker must be restarted from fresh terminals after migration application. The verifier may proceed only while its role marker remains `superuser=false|bypassrls=false|enabled=true|forced=true`.

Until the migration is applied and the complete restricted-role runtime campaign passes, the audit/reliability workstream remains partial. Phase 2 remains open; Phase 3 has not started; and production readiness is not established.

## Bounded Windows administrative inventory evidence

### Initial pre-provisioning inventory

After commit `9996db29` was synchronized with fast-forward-only pull, the user ran the new inventory command with the API and worker stopped and PostgreSQL reachable. The command selected the runtime fallback because no protected `MIGRATION_DATABASE_URL` was configured; it used the existing local connection only for read-only inventory. The bounded output was:

```text
admin_inventory_source=runtime_fallback
admin_inventory_current=superuser=true|bypassrls=true|createdb=true|createrole=true|canlogin=true|owned_relations=114|owned_functions=6|owns_public_schema=false
admin_inventory_target=exists=false|canlogin=false|superuser=false|bypassrls=false|createdb=false|createrole=false|schema_usage=false|schema_create=false|memberships=0|owned_relations=0|owned_functions=0
admin_inventory_audit_rls=enabled=true|forced=true
```

This initial inventory confirmed that the current connection was an administrative superuser with `BYPASSRLS` and substantial ownership, and therefore could not be reused as valid restricted-role RLS evidence. It also confirmed that the target runtime role did not yet exist and that `AuditEvent` RLS was enabled and forced. No role, password, grant, ownership, protected environment value, or existing row was changed by this inventory.

### Post-provisioning inventory

After the user-run provisioning and protected runtime cutover, the read-only inventory selected `MIGRATION_DATABASE_URL` and reported the following bounded state:

```text
admin_inventory_source=migration_url
admin_inventory_current=superuser=true|bypassrls=true|createdb=true|createrole=true|canlogin=true|owned_relations=114|owned_functions=6|owns_public_schema=false
admin_inventory_target=exists=true|canlogin=true|superuser=false|bypassrls=false|createdb=false|createrole=false|schema_usage=true|schema_create=false|memberships=0|owned_relations=0|owned_functions=0
admin_inventory_audit_rls=enabled=true|forced=true
admin_inventory_audit_boundary=insert_granted=true|select_granted=true|delete_granted=true|user_select_granted=true|tenant_select_granted=true|membership_select_granted=true|user_references_granted=false|tenant_references_granted=false|membership_references_granted=false|insert_policies=2|permissive_insert_policies=2|restrictive_insert_policies=0|global_insert_policy=true|tenant_insert_policy=true|append_only_trigger=true|foreign_keys=3|trigger_execute=true
```

This post-provisioning inventory confirms that the target runtime role exists with no memberships or object ownership, while the administrative migration connection remains separate. It also confirms the explicit AuditEvent privilege, policy, trigger, and referenced-table SELECT boundary used in the source-level diagnosis. No database data was reset or recreated by the inventory. The remaining database action is applying the published additive RLS migration, followed by the restricted-role runtime campaign. The verifier’s direct fixture writes are not evidence of application-role privileges because they use the separate protected migration connection; the runtime assertions remain application-role evidence.

## Source-confirmed tenant OutboxMessage RLS failure and correction

The first valid restricted-role runtime campaign progressed beyond global OIDC AuditEvent creation and administrative fixture setup, then the real tenant-switch API returned HTTP 500. The sanitized API diagnostic identified Prisma P2039/PostgreSQL `42501` on `OutboxMessage`, with the new row rejected by the tenant INSERT policy. The transaction-local probe had already shown a valid tenant context and effective runtime table privileges; the administrative catalog inventory showed the expected permissive Outbox INSERT policy and no broad privilege gap.

The source audit found the precise mismatch. `MembershipService` binds a transaction-local UUIDv4 `app.operation_id` for the tenant switch. `AuditService` previously used the request `correlationId` as the persisted tenant outbox `operationId`. The applied `OutboxMessage_context_insert` policy requires the persisted tenant outbox operation identifier to equal the transaction-local `app.operation_id`, so the row was correctly rejected by forced RLS. Correlation identifiers and transaction operation identifiers are distinct and must not be substituted for one another.

The repository correction reads and validates `current_setting('app.operation_id', true)` on the same Prisma transaction immediately before creating a tenant outbox message and passes that value as the outbox tenant context. It preserves the request correlation ID separately, changes no RLS policy or privilege, and does not use the administrative migration connection in API/worker runtime. A focused AuditService regression test verifies that tenant outbox linkage uses the transaction-local operation identifier.

The correction is statically verified and published, but it is not runtime-accepted until the real Windows tenant-switch mutation succeeds under `mohamy_app` and the downstream restricted-role audit, outbox, isolation, retry/dead-letter, retention/legal-hold, and concurrency assertions pass. Phase 2 remains open and production readiness is not established.

## Append-only boundary evidence and verifier correction

The restricted-role runtime campaign now proves the real tenant-switch API mutation, tenant-scoped AuditEvent and OutboxMessage creation, outbox delivery and duplicate suppression, same-tenant visibility, cross-tenant read isolation, cross-tenant write denial, and zero-residue cleanup. It then stopped at `audit_append_only_boundary`.

The source-audited runtime privilege matrix intentionally grants `mohamy_app` `SELECT, INSERT, DELETE` on `AuditEvent` and omits `UPDATE`. This omission is part of the append-only security boundary; it must not be changed merely to force a trigger-level UPDATE test. The existing `AuditEvent_append_only` trigger still rejects ordinary UPDATE and non-eligible DELETE operations, while the dedicated retention path is allowed to delete only expired non-held rows.

The verifier correction now classifies an attempted UPDATE or DELETE as blocked when the operation raises the existing append-only/RLS boundary error or returns zero affected rows under forced RLS. It then reads the audit event through the named dispatcher context and verifies that exactly one row remains. The verifier emits only the bounded mutation categories and reports PASS only when both attempts are blocked and the row remains intact. No grant, RLS policy, trigger, migration, password, ownership, or existing data was changed.

This correction is statically verified but not runtime-accepted. The next Windows run must prove the append-only marker and then continue to retention/legal-hold, retry/dead-letter, and same-session concurrency stages. Phase 2 remains open and production readiness is not established.
