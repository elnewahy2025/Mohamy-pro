[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$requiredVersion = '11.22.0'

$command = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if ($command) {
    $pnpmPath = $command.Source
} else {
    $pnpmPath = Join-Path $env:APPDATA 'npm\pnpm.cmd'
}

if (-not (Test-Path $pnpmPath)) {
    throw "pnpm $requiredVersion is not installed. Install pnpm $requiredVersion outside the repository, open a new PowerShell window, then dot-source this script again."
}

$pnpmDirectory = Split-Path -Parent $pnpmPath
$pathEntries = $env:Path -split [IO.Path]::PathSeparator
if ($pathEntries -notcontains $pnpmDirectory) {
    $env:Path = "$pnpmDirectory$([IO.Path]::PathSeparator)$env:Path"
}

$actualVersion = (& $pnpmPath --version).Trim()
if ($actualVersion -ne $requiredVersion) {
    throw "This repository requires pnpm $requiredVersion, but the active executable reports pnpm $actualVersion."
}

Set-Alias -Name pnpm -Value $pnpmPath -Scope Global
Write-Output "Using pnpm $actualVersion at $pnpmPath"
