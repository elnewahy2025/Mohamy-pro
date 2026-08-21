# Phase 1 Foundation Acceptance Report

## Published revision

The latest migration-checker correction is published to `main` at commit `170e09e3`:

<https://github.com/elnewahy2025/Mohamy-pro/commit/170e09e3>

The published correction makes the checker evaluate migration rows by migration name and current ordered state. A rolled-back attempt followed by a later successful attempt is retained as historical information rather than incorrectly reported as unresolved. A latest rolled-back or unfinished attempt, contradictory successful checksums, unknown successful migrations, pending repository migrations, and checksum drift remain blocking results.

Phase 1 is **not closed**. The user's Windows database has one successfully applied migration, `20260820144702_init`, whose SQL is absent from the repository and whose SHA-256 checksum differs from the canonical repository migration. This is a genuine migration-history reproducibility blocker and has not been bypassed.

## Implemented foundation

The API includes validated environment configuration, structured Pino logging, correlation IDs, redacted sensitive headers, standardized HTTP errors, Helmet security headers, CORS configuration, URI API versioning, OpenAPI documentation, PostgreSQL access through the Prisma 7 PostgreSQL adapter, Redis, BullMQ, private S3-compatible object storage, transactional outbox persistence and dispatch, idempotency registry operations, liveness and readiness endpoints, and deterministic unit tests.

The frontend is implemented under `apps/web` with Next.js 16 App Router, React 19, Tailwind CSS, a shadcn-compatible UI primitive, TanStack Query, React Hook Form, Zod, `next-intl`, accessible navigation, responsive layout, English and Arabic message catalogs, locale-prefixed routing, and automatic LTR/RTL document direction. Shared API contracts remain under `packages/contracts`.

The repository contains the Phase 1 Prisma schema and baseline migration, additive outbox delivery migration, baseline-index repair migration, infrastructure-backed CI, environment configuration, observability baseline documentation, a Windows PostgreSQL backup script, and a disposable restore smoke test. Finding 2 has a dedicated worker entrypoint, explicit handler registry, lease/retry/dead-letter state transitions, and focused delivery tests. Finding 4 has dedicated quality, dependency-review, security, container, and DAST jobs.

## Verified evidence

| Check | Result | Evidence |
|---|---|---|
| pnpm version | PASS | Windows output: `Done in 403ms using pnpm v11.22.0` |
| Frozen pnpm install | PASS | Windows command completed successfully across all 6 workspace projects |
| Prisma Client generation | PASS | Windows output confirms Prisma Client v7.9.1 generation |
| Prisma migration deployment | PASS | Windows output: `3 migrations found`; `No pending migrations to apply` |
| Migration checker execution | BLOCKED as intended | Checker reports unknown applied `20260820144702_init`; no false incomplete report for superseded `00000000000000_init` |
| Migration-history classifier tests | PASS | 5 Node tests executed in `backend/api`: 5 passed, 0 failed |
| Migration SQL comparison | PASS with blocker | Preserved local hash `8c9c8776…a4a07a`; canonical hash `439e9a21…d8d37`; byte-identical `False` |
| Live Prisma schema diff | PASS with blocker | Read-only `migrate diff` reports legacy `OutboxMessage_status_createdAt_idx` outside the current datamodel |
| Live application indexes | PASS | Windows query reports 10 indexes, including the five repaired/application indexes and primary-key indexes |
| API ESLint gate | PASS in prior evidence | No errors in the recorded Phase 1 verification |
| API unit tests | PASS in prior evidence | Recorded full API suite: 3 suites, 9 tests; focused outbox tests included |
| API production build | PASS in prior evidence | Recorded build completed successfully |
| Frontend unit tests | PASS in prior evidence | 1 file, 2 tests covering bilingual message parity and direction labels |
| Frontend production build | PASS in prior evidence | Next.js 16.3.1 App Router build completed successfully |
| CI workflow structure and required controls | PASS locally; hosted run pending | External GitHub Actions execution remains required |
| Architecture-fitness check | PASS in prior evidence | Recorded architecture check completed successfully |
| License policy check | PASS in prior evidence | Recorded check covered 16 license categories |
| Windows API runtime | UNVERIFIED in this checkpoint | Liveness, readiness, OpenAPI, worker, and restore smoke evidence still required after migration reconciliation |

## Windows migration evidence

The Windows PostgreSQL migration table currently contains these records:

| Migration | Database state | Repository state | Assessment |
|---|---|---|---|
| `20260820144702_init` | Successful; checksum `8c9c8776…a4a07a` | Directory absent | BLOCKING unknown applied migration |
| `00000000000000_init` | One rolled-back attempt followed by one successful record; checksum `439e9a21…d8d37` | Canonical directory present | Accepted by the corrected checker as a superseded attempt |
| `20260820190000_outbox_delivery_semantics` | Successful | Directory present | Consistent |
| `20260821000000_repair_baseline_indexes` | Successful | Directory present | Consistent |

The preserved machine-local migration and the canonical migration are not byte-identical. The comparison shows canonical-only schema/index statements, including `CREATE SCHEMA IF NOT EXISTS "public"` and the five baseline index statements. The machine-local migration therefore cannot be silently declared equivalent to the canonical migration.

The live database contains ten indexes. The current Prisma model and outbox claim query use `status/availableAt/createdAt`, `status/claimedAt`, and `aggregateType/aggregateId`. The extra `OutboxMessage_status_createdAt_idx` is a legacy index created by the repair migration and is not represented in the current Prisma datamodel. No `DROP INDEX` statement has been executed. Any cleanup must be a reviewed forward-only migration and must not be confused with resolving the unknown migration history.

## Rule #2-compliant Windows commands

Run commands from the actual repository root and preserve local changes. The current local Compose modification and `ENGINEERING_BACKLOG.zip` must not be deleted, reset, stashed, or overwritten without explicit approval.

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
$pnpmCmd = "$env:APPDATA\npm\pnpm.cmd"
& $pnpmCmd --version
& $pnpmCmd install --frozen-lockfile
& $pnpmCmd --filter api exec prisma validate
& $pnpmCmd --filter api exec prisma generate
& $pnpmCmd --filter api exec prisma migrate status
$env:DATABASE_URL = 'postgresql://mohamy:mohamy_password@localhost:55432/mohamy_pro?schema=public'
& $pnpmCmd --filter api run db:check
```

The final command is expected to remain blocking until the unknown applied migration receives an explicit, reviewed resolution. Do not run `migrate reset`, `db push`, `migrate resolve`, direct edits to `_prisma_migrations`, table drops, volume deletion, or commands that recreate unrelated Docker containers.

## Remaining Windows runtime gates

After the migration-history decision is explicitly approved and the checker reaches the intended result, run the API build and tests through the absolute pnpm path, start the API and worker against the isolated PostgreSQL, Redis, and MinIO services, and verify liveness, readiness, OpenAPI, queue behavior, and backup/restore. The exact output must be added here before any production-readiness claim.

```powershell
& $pnpmCmd --filter api run build
& $pnpmCmd --filter api exec jest --runInBand
& $pnpmCmd --filter api start:dev
```

In a second PowerShell window:

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health/live
Invoke-RestMethod http://localhost:3000/api/v1/health/ready
(Invoke-WebRequest http://localhost:3000/api/docs-json).StatusCode
```

Run the backup and restore smoke test only after the API and infrastructure checks succeed:

```powershell
& .\infrastructure\backup\backup.ps1
$backup = Get-ChildItem .\infrastructure\backup\artifacts\mohamy_pro-*.sql | Sort-Object LastWriteTime | Select-Object -Last 1
& .\infrastructure\backup\restore-smoke.ps1 -BackupFile $backup.FullName
```

The restore smoke test must leave the primary `mohamy_pro` database and the existing Health-ERP and Vision-ERP containers unchanged.

## Phase boundary

No Phase 2 feature work should begin. Phase 1 remains **partially verified and blocked** by the non-reproducible applied migration `20260820144702_init`, the unreviewed legacy index cleanup, the hosted CI run, and the remaining Windows runtime evidence gates. Phase 2 begins only after the user reviews the complete evidence and explicitly approves Phase 1 closure.

## References

1. [`Phase 1 audit report`](AUDIT_REPORT.md)
2. [`Phase 1 remediation plan`](REMEDIATION_PLAN.md)
3. [`Migration baseline reconciliation`](MIGRATION_BASELINE_RECONCILIATION.md)
4. [`Migration checker semantics`](MIGRATION_CHECKER_SEMANTICS.md)
5. [`Live schema and index review`](MIGRATION_INDEX_REVIEW.md)
6. [`Engineering governance skill`](../../skills/engineering-governance/SKILL.md)
7. [`Published migration-checker correction`](https://github.com/elnewahy2025/Mohamy-pro/commit/170e09e3)
