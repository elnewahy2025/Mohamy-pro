# Finding 1 — Migration Baseline Reconciliation

## Status

Finding 1 is **partially verified and remains blocked**. The repository has one intentional canonical baseline plus two subsequent migrations, and the Windows database has successfully applied all three repository migrations. However, the same database also contains a successfully applied machine-local migration, `20260820144702_init`, whose SQL is absent from the repository and whose checksum differs from the canonical baseline. The migration checker correctly blocks this non-reproducible history.

## Repository migration history

The repository currently contains these migration directories:

```text
backend/api/prisma/migrations/00000000000000_init/
backend/api/prisma/migrations/20260820190000_outbox_delivery_semantics/
backend/api/prisma/migrations/20260821000000_repair_baseline_indexes/
```

The canonical baseline is `00000000000000_init`. The second migration adds outbox delivery metadata and its current query-supporting indexes. The third migration is a forward-only repair for five baseline indexes omitted by the machine-local duplicate migration.

## Windows evidence

The following evidence was supplied from the user's Windows 11 repository and isolated Docker PostgreSQL instance.

| Evidence | Result |
|---|---|
| pnpm version | `11.22.0` |
| Frozen workspace install | Completed across all 6 workspace projects |
| Prisma Client generation | Completed with Prisma 7.9.1 |
| Prisma migration deployment | `3 migrations found`; no pending migrations |
| Migration checker | Blocks on unknown applied `20260820144702_init` |
| Local migration hash | `8c9c877613f8968c5f06cbaff150d97857b4f86a29138bb4f88fcb4e28a4a07a` |
| Canonical baseline hash | `439e9a21d4729db9a428201c5785e550bdbdb1a9d99e2d6791e63bfdd32d8d37` |
| Local versus canonical SQL | Not byte-identical |
| Live application indexes | 10 indexes present |
| Live Prisma schema diff | Reports legacy `OutboxMessage_status_createdAt_idx` outside the current datamodel |

The database migration table contains a successful local migration, one rolled-back and one successful record for the canonical baseline, and successful records for both subsequent repository migrations. The corrected checker accepts the superseded rolled-back baseline attempt but continues to reject the unknown local migration.

## SQL comparison

The preserved local migration and canonical migration share the table definitions, but they are not byte-identical. The supplied `Compare-Object` output shows canonical-only statements for the public schema and five baseline indexes:

```sql
CREATE SCHEMA IF NOT EXISTS "public";
CREATE INDEX "Health_createdAt_idx" ON "Health"("createdAt");
CREATE INDEX "OutboxMessage_status_createdAt_idx" ON "OutboxMessage"("status", "createdAt");
CREATE INDEX "OutboxMessage_aggregateType_aggregateId_idx" ON "OutboxMessage"("aggregateType", "aggregateId");
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");
CREATE INDEX "IdempotencyKey_tenantId_userId_idx" ON "IdempotencyKey"("tenantId", "userId");
```

The database is functionally closer to the repository schema because the later repair migration restored these indexes. This does not make the migration history reproducible: the successfully applied local migration remains a separate database event with a distinct checksum.

## Checker behavior

The executable checker is [`backend/api/scripts/check-migrations.mjs`](../../backend/api/scripts/check-migrations.mjs), with history classification in [`backend/api/scripts/migration-checker-core.mjs`](../../backend/api/scripts/migration-checker-core.mjs). It is read-only and fails for unknown successful migrations, checksum mismatches, contradictory successful checksums, unresolved latest failed or unfinished attempts, and pending repository migrations. It reports a failed attempt as superseded only when a later successful record for the same migration name exists and is the latest state.

The focused classifier test file is [`backend/api/scripts/migration-checker-core.test.mjs`](../../backend/api/scripts/migration-checker-core.test.mjs). Its executed result was five tests passed and zero failed.

## Legacy index review

The live Prisma diff reports `DROP INDEX "OutboxMessage_status_createdAt_idx"` because the current datamodel and outbox claim query use `status/availableAt/createdAt`, not `status/createdAt`. The index was created by the forward-only repair migration because it was part of the canonical baseline's missing indexes. The current query-supporting index is created by `20260820190000_outbox_delivery_semantics`.

No `DROP INDEX` statement has been executed. Removing the legacy index, if approved after operational review, must be performed through a reviewed forward-only cleanup migration. This cleanup is independent of the unknown migration-history blocker.

## Non-destructive constraints

No schema, table, volume, container, or migration metadata was deleted or reset during this reconciliation. The following operations remain prohibited for this finding: `migrate reset`, `db push`, direct edits to `_prisma_migrations`, volume deletion, table drops, and commands that recreate the user's unrelated Health-ERP or Vision-ERP containers.

## Closure criteria

Finding 1 can be marked closed only when all of the following have evidence:

1. The repository contains one intentional canonical migration history with no duplicate baseline.
2. The checker passes against the user-local PostgreSQL database, or the user explicitly approves a documented legacy-history exception that preserves the checker’s detection of real drift.
3. A clean disposable PostgreSQL database applies the complete repository migration directory successfully.
4. The existing database remains intact and reports no unknown, unresolved, pending, or checksum-drifted migration history.
5. The live schema contains only reviewed, intentional indexes, with any legacy-index cleanup deployed through a committed migration if required.
6. CI runs the same migration-history check after migration deployment.
7. The acceptance report records exact Windows output and the commit containing the remediation.

Until these criteria are met, Phase 1 remains open and Phase 2 Identity and Multi-Tenancy work remains paused.

## References

1. [`Phase 1 audit report`](AUDIT_REPORT.md)
2. [`Phase 1 remediation plan`](REMEDIATION_PLAN.md)
3. [`Phase 1 acceptance report`](ACCEPTANCE_REPORT.md)
4. [`Migration checker semantics`](MIGRATION_CHECKER_SEMANTICS.md)
5. [`Live schema and index review`](MIGRATION_INDEX_REVIEW.md)
6. [`Prisma schema`](../../backend/api/prisma/schema.prisma)
7. [`Canonical migration SQL`](../../backend/api/prisma/migrations/00000000000000_init/migration.sql)
8. [`Outbox delivery migration`](../../backend/api/prisma/migrations/20260820190000_outbox_delivery_semantics/migration.sql)
9. [`Baseline index repair migration`](../../backend/api/prisma/migrations/20260821000000_repair_baseline_indexes/migration.sql)
10. [`Repository plan`](../../Plan.txt)
