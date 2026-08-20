[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,
    [string]$ComposeFile = (Join-Path $PSScriptRoot '..\docker\docker-compose.yml')
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI is required.'
}

$backupPath = (Resolve-Path $BackupFile).Path
$composePath = (Resolve-Path $ComposeFile).Path
$postgresContainer = (& docker compose -f $composePath ps -q postgres).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($postgresContainer)) {
    throw 'The Mohamy PostgreSQL Compose service is not running.'
}

$containerBackupPath = '/tmp/mohamy-restore-smoke.sql'
$databaseName = "mohamy_restore_smoke_$((Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'))"
$quotedDatabase = '"' + $databaseName + '"'
$created = $false

try {
    & docker cp $backupPath "${postgresContainer}:$containerBackupPath"
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not copy the backup into the PostgreSQL container.'
    }

    & docker compose -f $composePath exec -T postgres psql -U mohamy -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $quotedDatabase;"
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not create the temporary restore database.'
    }
    $created = $true

    & docker compose -f $composePath exec -T postgres psql -U mohamy -d $databaseName -v ON_ERROR_STOP=1 -f $containerBackupPath
    if ($LASTEXITCODE -ne 0) {
        throw 'Backup import failed.'
    }

    $healthTableQuery = 'SELECT to_regclass(''public."Health"'') IS NOT NULL;'
    $tableCheckOutput = & docker compose -f $composePath exec -T postgres psql -U mohamy -d $databaseName -tAc $healthTableQuery
    $tableCheckExitCode = $LASTEXITCODE
    $tableCheck = ($tableCheckOutput | Out-String).Trim()
    if ($tableCheckExitCode -ne 0 -or $tableCheck -ne 't') {
        throw 'Restore validation failed: the Health table was not found.'
    }

    Write-Output "Restore smoke test passed for $databaseName."
}
finally {
    if ($created) {
        & docker compose -f $composePath exec -T postgres psql -U mohamy -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $quotedDatabase;" | Out-Null
    }
    & docker exec $postgresContainer rm -f $containerBackupPath | Out-Null
}
