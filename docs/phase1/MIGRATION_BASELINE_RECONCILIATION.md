# Finding 1 — Migration Baseline Reconciliation

## Status

The repository-side remediation is implemented, but Finding 1 is **not yet fully closed** because the user-local PostgreSQL migration table must be validated from the Windows machine that owns the database.

The repository contains one canonical Prisma migration:

```text
backend/api/prisma/migrations/00000000000000_init/migration.sql
```

The migration is the only migration present in repository history and its SQL creates the current `Health`, `OutboxMessage`, and `IdempotencyKey` tables and indexes. The repository also contains the Prisma PostgreSQL migration lock.

## Evidence reviewed

| Evidence | Result |
|---|---|
| Tracked migration directories | Exactly one: `00000000000000_init`. |
| Tracked migration SQL | One `migration.sql`, with the schema represented by the current Prisma models. |
| Repository history | The canonical migration was introduced by `df00c44d`; the migration lock was added by `5ff1edda`. |
| User-local database history from the audit transcript | `20260820144702_init` was finished, `00000000000000_init` initially failed because `Health` already existed, and `00000000000000_init` was later marked applied. |
| Sandbox database validation | Not available because Docker is not installed in the sandbox; no claim is made about the current Windows database state. |

The user-local `20260820144702_init` file was generated outside the repository before synchronization and is not available for an independent byte-for-byte checksum comparison. It is therefore treated as an **unknown applied migration**, not silently assumed to be equivalent to the canonical repository migration.

## Canonical decision

The repository’s canonical baseline remains `00000000000000_init`. This decision is based on repository history and the fact that it is the only migration intentionally published in the project. The generated local migration name is not promoted into the repository because doing so would encode a machine-local migration event as the project baseline without a committed source or reproducible review history.

No schema, table, volume, container, or migration metadata was deleted by this remediation. The existing user-local database must be reconciled separately and explicitly after a fresh backup.

## Implemented repository controls

A deterministic checker now runs from the API package:

```powershell
& "$env:APPDATA\npm\pnpm.cmd" db:check
```

The checker reads the repository migration directories and compares them with the live Prisma `_prisma_migrations` table. It fails when it finds an applied migration missing from the repository, a checksum mismatch, an incomplete or rolled-back migration, or a pending repository migration. It does not modify the database.

The same check is available in CI after migration deployment:

```text
pnpm db:check
```

The implementation is located at [`backend/api/scripts/check-migrations.mjs`](../../backend/api/scripts/check-migrations.mjs), exposed through the API and root `package.json` scripts, and invoked by [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

## Required Windows validation

Run these commands from the actual repository root. Do not run them from `C:\Windows\System32`, a parent directory, or a copied export. Do not use `npx`, `npm`, `yarn`, or `pnpm` without the required absolute Windows path if the current PowerShell PATH does not contain pnpm.

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
$pnpmCmd = "$env:APPDATA\npm\pnpm.cmd"
& $pnpmCmd --version
& $pnpmCmd install --frozen-lockfile
& $pnpmCmd --filter api exec prisma validate
& $pnpmCmd --filter api exec prisma generate
& $pnpmCmd --filter api exec prisma migrate status
& $pnpmCmd db:check
```

The expected result is that Prisma reports the schema is up to date and `db:check` reports consistent repository and database migration histories. If `db:check` reports `20260820144702_init` as missing from the repository, stop and send the complete output before making any database change.

## Non-destructive reconciliation procedure for the observed duplicate history

Because the audit transcript shows both a generated local migration and the canonical migration in the local `_prisma_migrations` table, the current database must not be altered by an automated workaround. First create a fresh backup using the existing project backup script and preserve the output. Then provide the output of the commands above and the migration table query below for review:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
docker compose -f '.\infrastructure\docker\docker-compose.yml' exec -T postgres psql -U mohamy -d mohamy_pro -c 'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at, migration_name;'
```

Do not run `migrate reset`, `prisma db push`, `docker compose down -v`, volume deletion, table drops, or direct deletion from `_prisma_migrations`. The correct reconciliation action depends on the exact checksum and current database state; it must be selected after the output is reviewed and must preserve the existing database.

## Closure criteria

Finding 1 can be marked closed only when all of the following are true:

1. The repository contains one intentional canonical migration history with no duplicate baseline.
2. The migration checker passes against the user-local PostgreSQL database.
3. A clean disposable PostgreSQL database applies the repository migrations successfully.
4. The existing database remains intact and reports no pending, unknown, incomplete, or checksum-drifted migrations.
5. CI runs the same migration-history check after deployment.
6. The acceptance report records the exact Windows output and the commit containing this remediation.

## References

1. [`Phase 1 audit report`](AUDIT_REPORT.md)
2. [`Phase 1 remediation plan`](REMEDIATION_PLAN.md)
3. [`Prisma schema`](../../backend/api/prisma/schema.prisma)
4. [`Canonical migration SQL`](../../backend/api/prisma/migrations/00000000000000_init/migration.sql)
5. [`Repository plan`](../../Plan.txt)
