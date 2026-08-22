# Phase 2 Implementation Baseline Verification

**Date:** 2026-08-22

**Repository revision:** `db29b776` before this evidence document is published.

**Environment:** Linux sandbox clone of the published repository. Windows Docker runtime was not used by this baseline run.

## Execution state

Before the commands, the API and worker were stopped in the sandbox. No Windows-local terminals, Docker containers, or user-local files were touched.

## Commands executed

```text
git status --short
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter api exec prisma validate
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate deploy
```

The repository was clean at the start. `pnpm --version` returned `11.22.0`. Frozen installation completed successfully. Prisma schema validation and Prisma Client generation completed successfully.

`prisma migrate deploy` was attempted as required but returned:

```text
Error: The datasource.url property is required in your Prisma config file when using prisma migrate deploy.
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: prisma migrate deploy
```

The sandbox did not have a `DATABASE_URL` configured for a reachable PostgreSQL service. This is an environment limitation, not a migration result. No migration reset, migration-table edit, volume deletion, or database mutation was attempted.

## Static and package verification

After the database command was blocked, the non-database baseline continued:

```text
pnpm --filter api run build
pnpm --filter api exec jest --runInBand
pnpm --filter api exec eslint 'src/**/*.ts' 'test/**/*.ts'
pnpm --filter @mohamy/web test
pnpm --filter @mohamy/web run build
```

Results:

| Check | Result |
|---|---|
| API build | PASS |
| API unit tests | PASS — 11 suites, 32 tests |
| API lint | PASS; no errors reported |
| Frontend tests | PASS — 1 file, 2 tests |
| Frontend production build | PASS — Next.js compiled, TypeScript completed, routes generated |
| Prisma schema validation | PASS |
| Prisma Client generation | PASS |
| Frozen dependency install | PASS |
| Prisma migration deployment | BLOCKED — no configured reachable PostgreSQL URL in the sandbox |
| Windows Docker runtime | NOT EXECUTED in this baseline |

The rate-limit unit test intentionally logged the expected fail-closed message `Rate limiter unavailable; request rejected`; the suite passed. This is not an application startup failure.

## Baseline decision

The static/package baseline passes. At the time of the sandbox run, the database/runtime baseline was **OPEN** because no reachable PostgreSQL URL was configured there. The subsequent Windows migration result below closes that specific baseline condition. Phase 2 schema implementation is still not present or runtime-verified; the Windows result verifies only the current migration state.

## Windows PostgreSQL migration result

The project owner executed the required command from the Windows repository checkout with the API and worker stopped, using the existing Mohamy PostgreSQL container and existing `mohamy_pro` database. The password was retrieved locally and was not included in the evidence.

Captured output:

```text
4 migrations found in prisma/migrations

No pending migrations to apply.
```

This confirms that the current Windows database is aligned with all four repository migrations and had no pending migration. The command was `prisma migrate deploy`; it did not reset the database, edit migration history, delete volumes, or remove data. Existing `mohamy_pro` rows remain preserved. This evidence is user-reported from the Windows terminal; no database contents were displayed or modified for this verification.

## Baseline decision

The static/package baseline and the Windows migration baseline are complete. The remaining Windows API/worker startup and runtime evidence is a later Phase 2 verification gate, not a reason to infer that Phase 2 application features already exist. Phase 2 schema implementation may now proceed through an additive migration only. The existing Windows database must receive only reviewed `prisma migrate deploy` changes; disposable databases are used for destructive test setup and cleanup.
