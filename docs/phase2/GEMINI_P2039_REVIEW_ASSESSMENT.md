# Phase 2 Assessment of the P2039 Review

**Status:** Analysis complete; no database, password, protected environment, or migration change performed.

## Verified facts

The restricted runtime marker passes:

```text
audit_rls_role_diagnostic=superuser=false|bypassrls=false|enabled=true|forced=true
```

The API and Keycloak transport checks pass. The OIDC callback reaches `session_creation`, and Prisma reports `P2039` for `AuditEvent`. The wrapped PostgreSQL driver code is `42501`, categorized as `insufficient_privilege`. Prisma documents P2039 as a catchable wrapper for an unmapped database-driver error [1].

## Review decision

The review correctly identifies the two broad meanings of PostgreSQL SQLSTATE `42501`: object privilege denial and RLS-policy denial. However, its claimed root cause is not supported by this repository’s source. `SessionService.createFromOidc` already enters `PrismaService.withGlobalOperationContext`, which starts one interactive transaction, sets `app.global_operation=true` through `set_config(..., true)`, and performs the session and audit operations through the transaction client. It then explicitly rebinds the same global context before creating the `AppSession` and calls `AuditService.recordInTransaction` with the same transaction client. The proposed `AuditService.recordGlobal` rewrite would not affect this failing path.

The supplied diagnostic code is rejected. Its `action`, `entity`, and `actorId` fields do not match the applied `AuditEvent` schema; it would write diagnostic rows without a cleanup plan; it uses a direct Prisma client rather than the repository’s adapter and context helpers; and it treats a successful global insert as proof without testing the actual session-creation transaction. It is therefore not a valid production-ready fix or verifier.

## Correct next fix direction

The exact failing operation is the `AuditEvent` insert inside the existing global transaction. Because the runtime role has already been provisioned with the explicit table grant and the failure is `42501`, the next repository-safe diagnostic must distinguish **privilege denial at the statement boundary** from **RLS denial at the policy boundary** using the actual transaction path. It must be bounded, use the existing `PrismaService` context helper, avoid test rows in the existing database, and report only an allowlisted classification.

The first implementation should add a safe database-error classifier for Prisma P2039 that reports the wrapped PostgreSQL SQLSTATE and a bounded category, then add a focused test using a synthetic Prisma-shaped error object. The runtime verifier should not be changed to insert arbitrary diagnostic rows. Once the exact SQLSTATE is known, the fix must be limited to the corresponding missing explicit grant or the actual source-level context/policy defect. No blanket grant, RLS weakening, direct bypass, password change, role ownership change, migration-history change, or data reset is acceptable.

The current source audit already rules out the review’s suggested missing `app.global_operation` binding as the primary explanation. The next diagnostic must therefore expose the database error’s safe driver code from the live `P2039` object or its documented wrapper message and, if needed, a bounded policy/object classification performed in the user’s approved administrative session. Until that evidence identifies the precise boundary, the runtime campaign remains blocked at authenticated fixture/session creation.

## Remaining Phase 2 status

The least-privilege role boundary is verified. Audit source creation and outbox behavior were previously partially verified under the administrative bypassing role, but valid restricted-role RLS isolation, append-only behavior, retention/legal hold, retry/dead-letter, and same-session tenant-switch concurrency remain unaccepted. Phase 2 remains open, Phase 3 has not started, and production readiness is not established.

## Reference

[1]: https://www.prisma.io/changelog/2026-04-27 "Prisma ORM changelog: Catch more database driver errors"


## External verification

Prisma’s official ORM error reference documents `PrismaClientKnownRequestError` as carrying a Prisma-specific `code` and `meta`, while the official Prisma changelog explains that P2039 wraps an otherwise unmapped database-driver error and preserves the driver error under `driverAdapterError` [1] [2]. The PostgreSQL privilege documentation confirms that `INSERT` is a table privilege, schema `USAGE` permits object lookup, and function `EXECUTE` is a separate privilege; it also states that table privileges are not granted to `PUBLIC` by default, while function `EXECUTE` is granted to `PUBLIC` by default and may be revoked [3]. PostgreSQL’s `CREATE TRIGGER` documentation states that `EXECUTE` on a trigger function is required when creating the trigger, not that application DML requires a runtime trigger-function grant [4].

These sources support retaining explicit table and helper-function grants, but they do not support the supplied review’s proposed direct diagnostic or its claim that context binding is missing in this source path.

[2]: https://www.prisma.io/changelog/2026-04-27 "Prisma ORM changelog: Catch more database driver errors"
[3]: https://www.postgresql.org/docs/current/ddl-priv.html "PostgreSQL Documentation: Privileges"
[4]: https://www.postgresql.org/docs/current/sql-createtrigger.html "PostgreSQL Documentation: CREATE TRIGGER"


## PostgreSQL privilege findings relevant to SQLSTATE 42501

The official PostgreSQL row-security documentation confirms that normal `INSERT` access is subject to both SQL privileges and a policy `WITH CHECK` expression, that `FORCE ROW LEVEL SECURITY` applies policies to table owners, and that referential-integrity checks such as foreign-key references bypass row security [5]. The official privileges documentation distinguishes table `INSERT`, schema `USAGE`, function `EXECUTE`, and table `REFERENCES`; it also notes that table privileges are not granted to `PUBLIC` by default, while function `EXECUTE` is granted to `PUBLIC` by default [6]. The official `CREATE TRIGGER` documentation requires `EXECUTE` on a trigger function when creating the trigger, which does not establish that ordinary application DML requires a trigger-function grant at firing time [7].

These findings narrow the likely boundary: a missing `REFERENCES` grant is not a general prerequisite for ordinary DML on a table with an already-created foreign key, while a missing table `INSERT` grant or an RLS `WITH CHECK` failure remains plausible. The repository source already binds `app.global_operation=true` in the same interactive transaction before the `AuditEvent` insert, so an additional standalone context-setting call would not be a valid correction.

[5]: https://www.postgresql.org/docs/current/ddl-rowsecurity.html "PostgreSQL Documentation: Row Security Policies"
[6]: https://www.postgresql.org/docs/current/ddl-priv.html "PostgreSQL Documentation: Privileges"
[7]: https://www.postgresql.org/docs/current/sql-createtrigger.html "PostgreSQL Documentation: CREATE TRIGGER"
