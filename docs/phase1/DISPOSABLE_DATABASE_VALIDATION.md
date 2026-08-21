# Phase 1 — Disposable Database Validation and Legacy-State Acceptance

## Decision under review

The existing Windows `mohamy_pro` database contains a successfully applied machine-local migration, `20260820144702_init`, that is absent from the repository and has a different SQL checksum from the canonical baseline. It will remain untouched and will be documented as a **legacy database state**.

Repository correctness will be validated independently on a fresh disposable PostgreSQL instance. This separates two claims that must not be conflated:

1. The three repository migrations are internally ordered, deployable, and checker-consistent on a clean database.
2. The existing Windows database has historical migration drift that is preserved rather than silently rewritten.

The first claim can be accepted if the disposable run completes with exit code 0. The second claim is accepted only as a documented exception with explicit user approval; it does not make the legacy database reproducible from the repository.

## Required acceptance evidence

| Requirement | Required evidence | Closure interpretation |
|---|---|---|
| Isolated database | New container and host port `55433`, separate from the existing Mohamy PostgreSQL port `55432` and its volume | PASS when readiness succeeds without changing existing containers or volumes |
| Repository migration set | Exactly the three repository directories are listed before deployment | PASS when the list is `00000000000000_init`, `20260820190000_outbox_delivery_semantics`, and `20260821000000_repair_baseline_indexes` |
| Clean deployment | `prisma migrate deploy` exits `0` and reports three migrations applied | PASS when no deployment error occurs |
| Migration metadata | Disposable `_prisma_migrations` contains exactly the three repository names, all with `finished_at` set and no `rolled_back_at` | PASS when the read-only query confirms this |
| Drift checker | `db:check` exits `0` against the disposable database | PASS when it reports migration history is consistent |
| Schema state | Read-only database query confirms expected tables and indexes | PASS when the schema is created only by the repository migrations |
| Existing database preservation | Existing port `55432`, database, volume, Compose file, local changes, and unrelated containers remain untouched | PASS when no operation targets or recreates them |
| Legacy-state documentation | Phase 1 acceptance report records the unknown migration, differing checksums, and explicit exception decision | Required before Phase 1 closure |

## Rule #2-compliant Windows procedure

Run every command from the actual repository root. The commands use `pnpm.cmd` through `$pnpmCmd`; no `npm`, `npx`, `yarn`, or bare package-manager substitute is used.

Before starting, inspect the local state. Do not continue with a pull if local changes are not understood:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
$pnpmCmd = "$env:APPDATA\npm\pnpm.cmd"
$repo = (Get-Location).Path
$compose = Join-Path $repo 'infrastructure\docker\docker-compose.yml'

git status --short --branch
git log -1 --oneline --decorate
& $pnpmCmd --version
```

Verify the repository migration set without changing it:

```powershell
$migrationsPath = Join-Path $repo 'backend\api\prisma\migrations'
$migrationNames = @(Get-ChildItem -LiteralPath $migrationsPath -Directory | Sort-Object Name | Select-Object -ExpandProperty Name)
$migrationNames

$expectedMigrations = @(
    '00000000000000_init',
    '20260820190000_outbox_delivery_semantics',
    '20260821000000_repair_baseline_indexes'
)

if (@(Compare-Object -ReferenceObject $expectedMigrations -DifferenceObject $migrationNames).Count -ne 0) {
    throw 'Repository migration set is not exactly the expected three migrations.'
}
```

Create an isolated temporary PostgreSQL container. This does not use the existing Compose PostgreSQL service, does not attach to `postgres_data`, and does not touch Health-ERP or Vision-ERP:

```powershell
$disposableName = 'mohamy-postgres-disposable-20260821'
$disposableDb = 'mohamy_pro_disposable'
$disposableUser = 'mohamy_disposable'
$disposablePassword = [guid]::NewGuid().ToString('N')
$disposablePort = 55433

$existingDisposable = docker ps -a --filter "name=^/$disposableName$" --format '{{.Names}}'
if ($existingDisposable) {
    docker rm -f $disposableName
}

$portInUse = Test-NetConnection -ComputerName localhost -Port $disposablePort -InformationLevel Quiet -WarningAction SilentlyContinue
if ($portInUse) {
    throw "Port $disposablePort is already in use; choose another disposable-only port and update the URL below."
}

docker run --detach `
    --name $disposableName `
    --env "POSTGRES_USER=$disposableUser" `
    --env "POSTGRES_PASSWORD=$disposablePassword" `
    --env "POSTGRES_DB=$disposableDb" `
    --publish "${disposablePort}:5432" `
    postgres:16-alpine

$ready = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
    docker exec $disposableName pg_isready -U $disposableUser -d $disposableDb 2>$null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    docker logs $disposableName
    throw 'Disposable PostgreSQL did not become ready.'
}
```

Run only the repository migrations against the disposable database. Save and restore the current shell value so later commands cannot accidentally target the disposable instance:

```powershell
$previousDatabaseUrl = $env:DATABASE_URL
$env:DATABASE_URL = "postgresql://${disposableUser}:${disposablePassword}@localhost:${disposablePort}/${disposableDb}?schema=public"

try {
    & $pnpmCmd --filter api exec prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'Disposable migration deployment failed.' }

    & $pnpmCmd --filter api run db:check
    if ($LASTEXITCODE -ne 0) { throw 'Disposable migration checker failed.' }

    docker exec $disposableName psql -U $disposableUser -d $disposableDb -c 'SELECT migration_name, finished_at, rolled_back_at, checksum FROM "_prisma_migrations" ORDER BY started_at, migration_name;'
    if ($LASTEXITCODE -ne 0) { throw 'Disposable migration metadata query failed.' }

    docker exec $disposableName psql -U $disposableUser -d $disposableDb -c 'SELECT tablename, indexname FROM pg_indexes WHERE schemaname = ''public'' ORDER BY tablename, indexname;'
    if ($LASTEXITCODE -ne 0) { throw 'Disposable schema/index query failed.' }
} finally {
    if ($null -eq $previousDatabaseUrl) {
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    } else {
        $env:DATABASE_URL = $previousDatabaseUrl
    }
}
```

The expected checker result is a zero exit code and a consistency message. The disposable migration table must show exactly the three repository migration names and no rolled-back rows. The command must not be run with the legacy `localhost:55432` URL.

After capturing the output, remove only the disposable container. This removes the temporary validation instance and does not affect the existing Mohamy Compose volume or unrelated containers:

```powershell
docker rm -f $disposableName
```

## Existing database preservation evidence

After the disposable run, verify the legacy database remains available without changing it:

```powershell
$legacyCompose = 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro\infrastructure\docker\docker-compose.yml'
docker compose -f $legacyCompose ps postgres
docker compose -f $legacyCompose exec -T postgres psql -U mohamy -d mohamy_pro -c 'SELECT current_database(), version();'
git status --short
```

Do not rerun `db:check` against the legacy database and interpret failure as repository failure. Its failure is expected until the legacy exception is documented and explicitly accepted.

## Closure decision

If the disposable deployment and checker both return exit code `0`, and the migration metadata query shows only the three repository migrations, then the repository migration chain is validated on a clean database. Phase 1 may proceed toward closure only after the acceptance report records all of the following:

- the exact disposable commands and exit codes;
- the exact three successful migration names and checksums;
- the absence of rolled-back or pending rows in the disposable database;
- the legacy Windows database migration rows and differing local/canonical checksums;
- the explicit decision to preserve the legacy database unchanged;
- the known limitation that the legacy database history is not reproducible from the repository;
- all remaining Phase 1 runtime, CI, observability, storage, security, and documentation gates.

A clean disposable database proves repository migration correctness. It does **not** erase the legacy database's historical drift or by itself prove that every Phase 1 acceptance criterion is complete.

## References

1. [`Phase 1 acceptance report`](ACCEPTANCE_REPORT.md)
2. [`Migration baseline reconciliation`](MIGRATION_BASELINE_RECONCILIATION.md)
3. [`Migration checker semantics`](MIGRATION_CHECKER_SEMANTICS.md)
4. [`Live schema and index review`](MIGRATION_INDEX_REVIEW.md)
5. [`Engineering governance skill`](../../skills/engineering-governance/SKILL.md)
6. [`Repository plan`](../../Plan.txt)
