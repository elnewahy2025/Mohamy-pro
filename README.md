# Mohamy Pro

Mohamy Pro is a foundation for secure legal operations. The repository is a pnpm monorepo containing the NestJS API, a bilingual React frontend shell, shared contracts, PostgreSQL migrations, Redis and BullMQ infrastructure, private S3-compatible object storage, and operational scripts.

## Local prerequisites

The supported local development environment is Windows 11, PowerShell, Docker Desktop, Node.js 22, and pnpm 11.22.0. The root `package.json` declares `pnpm@11.22.0` as the package manager; do not use npm, npx, yarn, or ad hoc package-manager commands for this repository.

At the beginning of every PowerShell session, from the actual repository root, dot-source the helper so the current session uses the correct global pnpm executable:

```powershell
. .\scripts\ensure-pnpm.ps1
pnpm --version
```

Before any pull, inspect and preserve local work:

```powershell
git status --short
```

Never reset, restore, stash, delete, or overwrite local changes without explicit approval. After a clean synchronization, run `pnpm install --frozen-lockfile`, `pnpm --filter api exec prisma generate`, and `pnpm --filter api exec prisma migrate deploy`.

The Mohamy Compose file deliberately uses isolated host ports so it can coexist with the existing Health ERP and Vision ERP stacks:

| Service | Host port | Container port |
|---|---:|---:|
| PostgreSQL | `55432` | `5432` |
| Redis | `56379` | `6379` |
| MinIO API | `59000` | `9000` |
| MinIO console | `59001` | `9001` |

## Start local infrastructure

Run from the repository root:

```powershell
docker compose -f .\infrastructure\docker\docker-compose.yml up -d postgres redis minio
docker compose -f .\infrastructure\docker\docker-compose.yml ps
```

These commands target only the Mohamy Compose project. Do not use `docker compose down -v` on a shared Docker Desktop installation.

## Install dependencies and configure the API

```powershell
pnpm install
Copy-Item .\backend\api\.env.example .\backend\api\.env
```

The local `.env` points Prisma to PostgreSQL at `localhost:55432` and Redis at `localhost:56379`. Keep `.env` out of version control.

## Apply database migrations

```powershell
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate deploy
```

For local schema development, use a named migration and review the generated SQL before committing it:

```powershell
Set-Location .\backend\api
pnpm exec prisma migrate dev --name change_description
Set-Location ..\..
```

## Run the API and frontend

```powershell
pnpm --filter api start:dev
pnpm --filter @mohamy/web dev
```

The API listens on `http://localhost:3000`; the frontend listens on `http://localhost:5173`. The API exposes `/api/v1/health/live`, `/api/v1/health/ready`, `/api/docs`, and `/api/docs-json`.

## Quality checks

```powershell
pnpm --filter api exec prisma validate
pnpm --filter api exec prisma generate
pnpm --filter api exec eslint "src/**/*.ts"
pnpm --filter api exec jest --runInBand
pnpm --filter api run build
pnpm --filter @mohamy/web test
pnpm --filter @mohamy/web run build
```

## Backup baseline

```powershell
& .\infrastructure\backup\backup.ps1
& .\infrastructure\backup\restore-smoke.ps1 -BackupFile .\infrastructure\backup\artifacts\mohamy_pro-YYYYMMDD-HHMMSS.sql
```

See [`docs/phase1/BACKUP_BASELINE.md`](docs/phase1/BACKUP_BASELINE.md) for Windows Task Scheduler setup and the exact safety boundaries of the restore smoke test.
