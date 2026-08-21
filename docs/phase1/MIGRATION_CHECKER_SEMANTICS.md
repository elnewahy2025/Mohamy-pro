# Migration Checker Semantics

## Purpose

This document defines the acceptance behavior for the Phase 1 migration-history checker. The checker is a read-only control; it must report genuine repository/database drift without modifying PostgreSQL migration metadata.

## Observed history that required clarification

The Windows database contains more than one `_prisma_migrations` row for `00000000000000_init`: an earlier attempt is marked rolled back and a later record for the same migration is marked finished. Treating every rolled-back row as independently fatal produces a false failure after a migration has subsequently completed successfully. Treating every historical failure as harmless would conceal an unresolved latest failure. The checker therefore evaluates the ordered history for each migration name.

## Acceptance model

| History for one migration name | Checker result | Reason |
|---|---|---|
| One successful row, with `finished_at` set and `rolled_back_at` empty | Accepted and compared with the repository checksum | The migration is successfully applied. |
| An earlier rolled-back or unfinished row followed by a later successful row | Accepted, with the historical attempt reported as retained history | The latest state is successful; the prior attempt is superseded, not unresolved. |
| A successful row followed by a later rolled-back or unfinished row | Rejected as incomplete or unresolved | The latest state is not successful. |
| Only rolled-back or unfinished rows | Rejected as incomplete or unresolved | No successful application exists. |
| More than one successful checksum for one migration name | Rejected as a checksum conflict | The database has contradictory successful records. |
| Successful migration name absent from the repository | Rejected as an unknown applied migration | Repository history cannot reproduce the database history. |
| Repository migration absent from the successful database state | Rejected as pending | The repository expects a migration not recorded as successfully applied. |
| Successful database checksum differs from the repository checksum | Rejected as checksum drift | The applied SQL cannot be proven identical to the repository SQL. |

The database rows are ordered by `started_at` and `migration_name`, matching the query used by the executable checker. For each migration name, the checker uses the final ordered row as the current state and uses successful rows to determine the applied checksum. A historical failed attempt is informational only when a later successful attempt exists and the final row is successful.

## Traceability

| Requirement | Source | Implementation | Tests | Evidence | Status |
|---|---|---|---|---|---|
| Detect missing repository migrations | Phase 1 migration reconciliation requirement | `backend/api/scripts/check-migrations.mjs` | Focused checker tests plus Windows database run | `unknownApplied` evaluation | BLOCKED by the unknown applied Windows migration; code and focused tests pass |
| Detect repository checksum drift | Phase 1 migration reconciliation requirement | `backend/api/scripts/check-migrations.mjs` | Focused classifier checksum-conflict test; live checker rerun pending | `checksumMismatches` and `checksumConflicts` evaluation | BLOCKED by the unknown applied Windows migration; code and focused tests pass |
| Reject unresolved latest migration attempts | Engineering governance database-integrity requirement | `backend/api/scripts/migration-checker-core.mjs` | Latest rolled-back and unfinished-row tests | `incompleteMigrations` evaluation | PASS in code and focused tests |
| Accept a failed attempt superseded by a later successful attempt | Observed Windows Prisma history and non-destructive reconciliation requirement | `backend/api/scripts/migration-checker-core.mjs` | Superseded-attempt test | `supersededAttempts` informational result | PASS in code and focused tests |
| Avoid database mutation | Engineering governance and remediation constraints | Checker performs only a `SELECT` query | Read-only implementation inspection | No `INSERT`, `UPDATE`, `DELETE`, `resolve`, or reset operation | PASS by inspection; runtime evidence pending |

## Safety boundary

This correction changes only checker interpretation. It does not change migration files, alter `_prisma_migrations`, promote the machine-local `20260820144702_init` migration, reset the database, drop data, or weaken Prisma migration validation. A database containing an unknown successful migration, checksum drift, or unresolved latest failure remains a blocking result.

## Verification status

The five focused classifier tests were executed from `backend/api` with Node's built-in test runner and passed. The corrected checker was rerun against the user's Windows PostgreSQL database. It correctly stopped on the unknown applied `20260820144702_init` migration and no longer reported the superseded rolled-back `00000000000000_init` attempt as unresolved. The repaired index query was also confirmed, with ten live indexes. Phase 1 migration reconciliation remains **partially verified and blocked** because the unknown migration history is not reproducible from the repository.

## References

1. [`Phase 1 migration reconciliation evidence`](MIGRATION_BASELINE_RECONCILIATION.md)
2. [`Engineering governance skill`](../../skills/engineering-governance/SKILL.md)
3. [`Executable migration checker`](../../backend/api/scripts/check-migrations.mjs)
4. [`Migration-history classifier`](../../backend/api/scripts/migration-checker-core.mjs)
5. [`Focused migration-history tests`](../../backend/api/scripts/migration-checker-core.test.mjs)
