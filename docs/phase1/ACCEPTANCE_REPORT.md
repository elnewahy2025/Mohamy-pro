# Phase 1 Foundation Acceptance Report

## Published revision

The latest Phase 1 foundation fixes are published to `main` at commit `d2ffd8dc`:

<https://github.com/elnewahy2025/Mohamy-pro/commit/d2ffd8dc>

The repository working tree was clean at the time of the audit. See [`AUDIT_REPORT.md`](AUDIT_REPORT.md) for the requirement-by-requirement closure review. Phase 1 is currently **implemented foundation / not yet closed** until the listed blockers are resolved or formally deferred.

## Implemented foundation

The API now includes validated environment configuration, structured Pino logging, correlation IDs, redacted sensitive headers, standardized HTTP errors, Helmet security headers, CORS configuration, URI API versioning, OpenAPI documentation, PostgreSQL access through the Prisma 7 PostgreSQL adapter, Redis, BullMQ, private S3-compatible object storage, transactional outbox persistence and dispatch, idempotency registry operations, liveness and readiness endpoints, and deterministic unit tests.

The frontend shell is implemented under `apps/web` with React, Vite, accessible navigation, responsive layout, English and Arabic resources, automatic LTR/RTL switching, persistent locale preference, and basic routes for overview, operations, integrations, and settings. Shared API contracts are under `packages/contracts`.

The repository now contains the Phase 1 Prisma schema and baseline migration, CI validation, environment template, observability baseline documentation, a Windows PostgreSQL backup script, and a disposable restore smoke test.

## Verified in the development environment

| Check | Result |
|---|---|
| Frozen pnpm install | Passed |
| Prisma schema validation | Passed |
| Prisma Client generation | Passed |
| Schema-to-empty migration SQL generation | Passed |
| API ESLint gate | Passed; no errors |
| API unit tests | Passed: 2 suites, 4 tests |
| API production build | Passed |
| Frontend unit tests | Passed: 1 file, 1 test |
| Frontend production build | Passed |
| Git diff check and clean working tree | Passed |

The sandbox cannot directly execute Docker Desktop or PowerShell on the user’s local PC. Therefore, the following final local smoke checks must be run on the Windows machine where the three Mohamy containers are already running.

## Final local smoke checks

From the repository root:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
git pull --ff-only origin main
pnpm install --frozen-lockfile
Copy-Item .\backend\api\.env.example .\backend\api\.env -Force
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate deploy
```

Start the API in one PowerShell window:

```powershell
pnpm --filter api start:dev
```

In a second PowerShell window, verify the process, readiness dependencies, and OpenAPI endpoints:

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health/live
Invoke-RestMethod http://localhost:3000/api/v1/health/ready
Invoke-WebRequest http://localhost:3000/api/docs-json | Select-Object -ExpandProperty StatusCode
```

The liveness response should report `status: ok`. The readiness response should report `status: ok` with `postgres`, `redis`, `queue`, and `objectStorage` all marked `up`. The OpenAPI request should return HTTP status `200`.

Run the backup and restore smoke test after the readiness check succeeds:

```powershell
& .\infrastructure\backup\backup.ps1
$backup = Get-ChildItem .\infrastructure\backup\artifacts\mohamy_pro-*.sql | Sort-Object LastWriteTime | Select-Object -Last 1
& .\infrastructure\backup\restore-smoke.ps1 -BackupFile $backup.FullName
```

The restore smoke test must report success and must leave the primary `mohamy_pro` database and all existing unrelated containers unchanged.

## Phase boundary

No Phase 2 feature work should begin until the local smoke checks above pass, particularly the corrected restore smoke test, and the blockers listed in [`AUDIT_REPORT.md`](AUDIT_REPORT.md) are resolved or formally accepted. Phase 2 begins with Identity and Multi-Tenancy only after this Phase 1 acceptance gate is approved.
