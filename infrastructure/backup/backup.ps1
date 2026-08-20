[CmdletBinding()]
param(
    [string]$ComposeFile = (Join-Path $PSScriptRoot '..\docker\docker-compose.yml'),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'artifacts')
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI is required.'
}

$composePath = (Resolve-Path $ComposeFile).Path
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path (Resolve-Path $OutputDirectory).Path "mohamy_pro-$timestamp.sql"

$dockerArgs = @(
    'compose', '-f', $composePath, 'exec', '-T', 'postgres',
    'pg_dump', '--clean', '--if-exists', '--no-owner', '--no-privileges',
    '-U', 'mohamy', '-d', 'mohamy_pro'
)

& docker @dockerArgs 1> $backupPath
if ($LASTEXITCODE -ne 0) {
    Remove-Item -Force -ErrorAction SilentlyContinue $backupPath
    throw "PostgreSQL backup failed with exit code $LASTEXITCODE."
}

$backup = Get-Item $backupPath
if ($backup.Length -lt 128) {
    Remove-Item -Force $backupPath
    throw "PostgreSQL backup is unexpectedly small: $($backup.Length) bytes."
}

Write-Output "Backup created: $($backup.FullName) ($($backup.Length) bytes)"
