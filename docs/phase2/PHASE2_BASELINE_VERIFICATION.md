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

The static/package baseline passes. The database/runtime baseline is **OPEN** until the Windows repository checkout runs the published restart sequence, exposes a reachable PostgreSQL URL, runs `pnpm --filter api exec prisma migrate deploy`, and records the result. Phase 2 schema implementation must not be reported as runtime-verified from this sandbox run.

The next allowed action is the Windows runtime baseline or a real disposable PostgreSQL baseline. No Phase 2 schema migration is accepted until the migration command passes against real PostgreSQL and the schema/migration evidence is retained.
