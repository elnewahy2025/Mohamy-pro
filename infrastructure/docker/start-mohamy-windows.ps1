[CmdletBinding()]
param(
    [switch]$Sync,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = (Resolve-Path (Join-Path $scriptDirectory '..\..')).Path
$composeFile = Join-Path $repositoryRoot 'infrastructure\docker\docker-compose.yml'

$requiredSecurityContainers = @(
    'mohamy-minkms',
    'mohamy-aistor-security',
    'mohamy-clamav-security'
)

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(Mandatory = $false)]
        [string[]]$Arguments = @()
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
}

function Assert-Command {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command is not available on PATH: $Name"
    }
}

function Ensure-ExistingContainerRunning {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    & docker container inspect $Name 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Required existing container is missing: $Name. This script never creates or bootstraps security containers."
    }

    $running = docker inspect -f '{{.State.Running}}' $Name
    if ($LASTEXITCODE -ne 0) {
        throw "Could not inspect required container: $Name"
    }

    if ($running -ne 'true') {
        Write-Host "Starting existing container: $Name"
        Invoke-Checked -FilePath 'docker' -Arguments @('start', $Name)
    }
    else {
        Write-Host "Already running: $Name"
    }
}

function Wait-ForPostgres {
    param(
        [int]$Attempts = 30
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        & docker compose -f $composeFile exec -T postgres pg_isready -U mohamy -d mohamy_pro 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host 'PostgreSQL is ready.'
            return
        }
        Start-Sleep -Seconds 2
    }

    throw 'PostgreSQL did not become ready within the expected time.'
}

function Wait-ForRedis {
    param(
        [int]$Attempts = 30
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        $result = docker compose -f $composeFile exec -T redis redis-cli ping 2>$null
        if ($LASTEXITCODE -eq 0 -and $result -match 'PONG') {
            Write-Host 'Redis is ready.'
            return
        }
        Start-Sleep -Seconds 2
    }

    throw 'Redis did not become ready within the expected time.'
}

function Wait-ForMinio {
    param(
        [int]$Attempts = 30
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        & curl.exe --fail --silent --show-error http://localhost:59000/minio/health/live 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host 'Primary MinIO is ready.'
            return
        }
        Start-Sleep -Seconds 2
    }

    throw 'Primary MinIO did not become ready within the expected time.'
}

function Invoke-RepositorySync {
    Write-Host 'Checking the repository before synchronization.'
    $status = git -C $repositoryRoot status --short
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not read Git status.'
    }

    if ($status) {
        Write-Host 'The working tree contains local changes:'
        $status | ForEach-Object { Write-Host $_ }
        throw 'Synchronization stopped. Preserve local changes and resolve the working-tree state explicitly before using -Sync.'
    }

    Invoke-Checked -FilePath 'git' -Arguments @('-C', $repositoryRoot, 'pull', '--ff-only', 'origin', 'main')
    Invoke-Checked -FilePath 'pnpm' -Arguments @('install', '--frozen-lockfile')
    Invoke-Checked -FilePath 'pnpm' -Arguments @('--filter', 'api', 'exec', 'prisma', 'generate')
    Invoke-Checked -FilePath 'pnpm' -Arguments @('--filter', 'api', 'exec', 'prisma', 'migrate', 'deploy')

    if (-not $SkipBuild) {
        Invoke-Checked -FilePath 'pnpm' -Arguments @('--filter', 'api', 'run', 'build')
    }
}

function Start-ApplicationTerminal {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,
        [Parameter(Mandatory = $true)]
        [string]$Title
    )

    $powerShell = Get-Command 'pwsh.exe' -ErrorAction SilentlyContinue
    if (-not $powerShell) {
        $powerShell = Get-Command 'powershell.exe' -ErrorAction SilentlyContinue
    }
    if (-not $powerShell) {
        throw 'Neither pwsh.exe nor powershell.exe is available.'
    }

    $safeRoot = $repositoryRoot.Replace("'", "''")
    $startupCommand = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location -LiteralPath '$safeRoot'; $Command"
    Start-Process -FilePath $powerShell.Source -ArgumentList @('-NoExit', '-Command', $startupCommand) | Out-Null
}

Assert-Command -Name 'docker'
Assert-Command -Name 'git'
Assert-Command -Name 'pnpm'
Assert-Command -Name 'curl.exe'

if (-not (Test-Path -LiteralPath $composeFile)) {
    throw "Compose file not found: $composeFile"
}

Write-Host "Repository: $repositoryRoot"
Write-Host 'This script does not stop, remove, recreate, or modify unrelated containers.'

& docker version | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop is not ready. Start Docker Desktop and run this script again.'
}

if ($Sync) {
    Invoke-RepositorySync
}

foreach ($container in $requiredSecurityContainers) {
    Ensure-ExistingContainerRunning -Name $container
}

Write-Host 'Starting only Mohamy PostgreSQL, Redis, and primary MinIO through Compose.'
Invoke-Checked -FilePath 'docker' -Arguments @('compose', '-f', $composeFile, 'up', '-d', 'postgres', 'redis', 'minio')

Wait-ForPostgres
Wait-ForRedis
Wait-ForMinio

Write-Host 'Infrastructure is ready. Opening the API and worker in separate PowerShell terminals.'
Start-ApplicationTerminal -Title 'Mohamy API' -Command 'pnpm --filter api start:prod'
Start-Sleep -Seconds 3
Start-ApplicationTerminal -Title 'Mohamy Worker' -Command 'pnpm --filter api start:worker'

Write-Host ''
Write-Host 'Mohamy restart sequence completed.' -ForegroundColor Green
Write-Host 'Keep the API and worker terminals open while using the application.'
Write-Host 'To stop gracefully later: Ctrl+C in the worker terminal first, then Ctrl+C in the API terminal.'
Write-Host 'No storage-security bootstrap or Docker volume operation was run.'
