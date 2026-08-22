[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$compose = Join-Path $repoRoot 'infrastructure\docker\docker-compose.yml'
$freshDatabase = 'mohamy_phase2_fresh_{0}_{1}' -f (Get-Date -Format 'yyyyMMddHHmmss'), (New-Guid).ToString('N').Substring(0, 8)
$created = $false
$originalDatabaseUrl = $env:DATABASE_URL

function Invoke-ComposePsql {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Database,
        [Parameter(Mandatory = $true)]
        [string]$Sql
    )

    & docker compose -f $compose exec -T postgres psql -v ON_ERROR_STOP=1 -U mohamy -d $Database -c $Sql
    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL command failed for database $Database."
    }
}

try {
    if (-not (Test-Path -LiteralPath $compose)) {
        throw "Compose file was not found at $compose."
    }

    $dbPassword = (& docker compose -f $compose exec -T postgres sh -lc 'printf "%s" "$POSTGRES_PASSWORD"').Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($dbPassword)) {
        throw 'The PostgreSQL container did not expose POSTGRES_PASSWORD. No disposable database was created.'
    }

    if ($freshDatabase -eq 'mohamy_pro') {
        throw 'Safety check refused to operate on the existing mohamy_pro database.'
    }

    $encodedPassword = [Uri]::EscapeDataString($dbPassword)
    $freshDatabaseUrl = "postgresql://mohamy:$encodedPassword@localhost:55432/${freshDatabase}?schema=public"
    $createSql = @"
CREATE DATABASE "$freshDatabase";
"@
    $dropSql = @"
DROP DATABASE "$freshDatabase";
"@

    Invoke-ComposePsql -Database 'postgres' -Sql $createSql
    $created = $true
    $env:DATABASE_URL = $freshDatabaseUrl

    Set-Location $repoRoot
    & pnpm --filter api exec prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
        throw 'Disposable migration deployment failed.'
    }

    & pnpm --filter api run db:check
    if ($LASTEXITCODE -ne 0) {
        throw 'Disposable migration checker failed.'
    }

    Write-Output "fresh_database=$freshDatabase"
    Write-Output 'fresh_database_result=PASS'
}
finally {
    $env:DATABASE_URL = $originalDatabaseUrl

    if ($created) {
        Invoke-ComposePsql -Database 'postgres' -Sql $dropSql
    }

    Remove-Variable dbPassword, encodedPassword, freshDatabaseUrl, createSql, dropSql, originalDatabaseUrl -ErrorAction SilentlyContinue
}
