[CmdletBinding()]
param(
    [string]$LicensePath = 'C:\Users\ahmed\Desktop\minio.license',
    [string]$RuntimeRoot = (Join-Path $env:USERPROFILE 'mohamy-storage-security')
)

$ErrorActionPreference = 'Stop'

$networkName = 'mohamy-storage-security'
$kmsName = 'mohamy-minkms'
$aistorName = 'mohamy-aistor-security'
$clamavName = 'mohamy-clamav-security'
$kmsImage = 'quay.io/minio/aistor/minkms@sha256:63b9a6a89488a4aeaf808869e35664c7b4e6bd6a5d2acb6b55d58ba225e1a0e2'
$aistorImage = 'quay.io/minio/aistor/minio@sha256:d1eb0f79ced75d6c024fc6a2ab6a7b3629ff54c798d967d9c6f89951237480a7'
$clamavImage = 'clamav/clamav@sha256:c3bfbf2a2c9abc1fc179e63832a9e8bfac901ede83853e3fa10acf6f1fb5c803'
$certgenUrl = 'https://github.com/minio/certgen/releases/download/v1.4.0/certgen-windows-amd64.exe'
$certgenSha256 = '58fa7d85a634cb433063c8e4101c904600ef22d61b8acd95422558cb491889fa'

function Invoke-Docker {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed with exit code ${LASTEXITCODE}: docker $($Arguments -join ' ')"
    }
}

function Test-DockerResourceExists {
    param([Parameter(Mandatory = $true)][string]$Name)
    $result = & docker ps -aq --filter "name=^/$Name$"
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect Docker resource $Name."
    }
    return -not [string]::IsNullOrWhiteSpace(($result | Out-String).Trim())
}

function New-RandomSecret {
    param([int]$ByteLength = 32)
    $bytes = New-Object byte[] $ByteLength
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

function Get-FirstApiKey {
    param([Parameter(Mandatory = $true)][string]$Text)
    $matches = [regex]::Matches($Text, 'k1:[A-Za-z0-9+/=_-]+')
    if ($matches.Count -eq 0) {
        throw 'The MinIO KMS command output did not contain an API key.'
    }
    return $matches[0].Value
}

function Get-LastApiKey {
    param([Parameter(Mandatory = $true)][string]$Text)
    $matches = [regex]::Matches($Text, 'k1:[A-Za-z0-9+/=_-]+')
    if ($matches.Count -eq 0) {
        throw 'The MinIO KMS identity command output did not contain an API key.'
    }
    return $matches[$matches.Count - 1].Value
}

function Invoke-KmsCli {
    param([Parameter(Mandatory = $true)][string[]]$CommandArguments)
    $arguments = @(
        'run', '--rm', '--network', $networkName,
        '-e', 'MINIO_KMS_SERVER=https://mohamy-minkms:7373',
        '-e', "MINIO_KMS_API_KEY=$script:rootApiKey",
        $kmsImage
    ) + $CommandArguments
    $output = (& docker @arguments 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "MinIO KMS CLI command failed: minkms $($CommandArguments -join ' ')"
    }
    return $output
}

if (-not (Test-Path -LiteralPath $LicensePath -PathType Leaf)) {
    throw "AIStor license file was not found at the supplied path: $LicensePath"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI is not available on PATH.'
}

foreach ($name in @($kmsName, $aistorName, $clamavName)) {
    if (Test-DockerResourceExists -Name $name) {
        throw "An isolated security container named $name already exists. Stop and inspect it explicitly before rerunning; this script will not remove existing containers."
    }
}

New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
$kmsRoot = Join-Path $RuntimeRoot 'minkms'
$aistorRoot = Join-Path $RuntimeRoot 'aistor'
$clamavRoot = Join-Path $RuntimeRoot 'clamav'
$certgenPath = Join-Path $RuntimeRoot 'certgen-windows-amd64.exe'
$kmsCerts = Join-Path $kmsRoot 'certs'
$aistorCerts = Join-Path $aistorRoot 'certs'
New-Item -ItemType Directory -Force -Path $kmsRoot, $aistorRoot, $clamavRoot, (Join-Path $kmsRoot 'data'), (Join-Path $aistorRoot 'data'), $kmsCerts, $aistorCerts, (Join-Path $aistorCerts 'CAs') | Out-Null

if (-not (Test-Path -LiteralPath $certgenPath -PathType Leaf)) {
    Invoke-WebRequest -Uri $certgenUrl -OutFile $certgenPath
}
$certgenHash = (Get-FileHash -LiteralPath $certgenPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($certgenHash -ne $certgenSha256) {
    throw "certgen SHA-256 mismatch. Expected $certgenSha256 but received $certgenHash."
}

if (-not (Test-Path -LiteralPath (Join-Path $kmsCerts 'public.crt') -PathType Leaf)) {
    Push-Location $kmsCerts
    try {
        & $certgenPath -host 'mohamy-minkms,localhost,127.0.0.1'
        if ($LASTEXITCODE -ne 0) { throw 'KMS certificate generation failed.' }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $aistorCerts 'public.crt') -PathType Leaf)) {
    Push-Location $aistorCerts
    try {
        & $certgenPath -host 'mohamy-aistor,localhost,127.0.0.1'
        if ($LASTEXITCODE -ne 0) { throw 'AIStor certificate generation failed.' }
    } finally {
        Pop-Location
    }
}

Copy-Item -LiteralPath (Join-Path $kmsCerts 'public.crt') -Destination (Join-Path $aistorCerts 'CAs' 'mohamy-minkms.crt') -Force

$kmsConfigPath = Join-Path $kmsRoot 'config.yaml'
@'
version: v1
tls:
  certs:
    - key: /etc/minkms/certs/private.key
      cert: /etc/minkms/certs/public.crt
'@ | Set-Content -LiteralPath $kmsConfigPath -Encoding utf8 -NoNewline

$hsmOutput = (& docker run --rm $kmsImage --soft-hsm 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'MinIO KMS soft-HSM key generation failed.'
}
$hsmMatch = [regex]::Match($hsmOutput, 'hsm:aes256:[A-Za-z0-9+/=_-]+')
if (-not $hsmMatch.Success) {
    throw 'MinIO KMS soft-HSM output did not contain the expected hsm:aes256 key format.'
}
$kmsEnvPath = Join-Path $kmsRoot 'minkms.env'
@(
    "MINIO_KMS_HSM_KEY=$($hsmMatch.Value)"
    'MINIO_KMS_VOLUME=/mnt/minio-kms'
) | Set-Content -LiteralPath $kmsEnvPath -Encoding utf8

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$secretGrant = "${currentUser}:(R,W)"
& icacls $kmsEnvPath /inheritance:r /grant:r $secretGrant | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to restrict permissions on $kmsEnvPath" }

$existingNetwork = & docker network inspect $networkName 2>$null
if ($LASTEXITCODE -ne 0) {
    Invoke-Docker -Arguments @('network', 'create', $networkName)
}

Invoke-Docker -Arguments @(
    'run', '-d', '--name', $kmsName, '--network', $networkName,
    '-p', '57373:7373',
    '-v', "$kmsCerts`:/etc/minkms/certs:ro",
    '-v', "$kmsConfigPath`:/etc/minkms/config.yaml:ro",
    '-v', "$kmsRoot/data`:/mnt/minio-kms",
    '--env-file', $kmsEnvPath,
    $kmsImage, 'server', '/mnt/minkms', '--config', '/etc/minkms/config.yaml'
)
Start-Sleep -Seconds 5
$kmsLogs = (& docker logs $kmsName 2>&1 | Out-String).Trim()
$script:rootApiKey = Get-FirstApiKey -Text $kmsLogs

$enclaveOutput = Invoke-KmsCli -CommandArguments @('add-enclave', 'mohamy-aistor', '-a', $script:rootApiKey, '-k')
$identityOutput = Invoke-KmsCli -CommandArguments @('add-identity', 'mohamy-aistor-service', '--enclave', 'mohamy-aistor', '--admin', '-k')
$script:serviceApiKey = Get-LastApiKey -Text $identityOutput
[void](Invoke-KmsCli -CommandArguments @('add-key', 'mohamy-default-key', '--enclave', 'mohamy-aistor', '--type', 'AES256', '-k'))

$aistorEnvPath = Join-Path $aistorRoot 'aistor.env'
@(
    "MINIO_ROOT_USER=mohamy-aistor-admin"
    "MINIO_ROOT_PASSWORD=$(New-RandomSecret)"
    'MINIO_KMS_SERVER=https://mohamy-minkms:7373'
    'MINIO_KMS_ENCLAVE=mohamy-aistor'
    'MINIO_KMS_SSE_KEY=mohamy-default-key'
    "MINIO_KMS_API_KEY=$($script:serviceApiKey)"
    'MINIO_KMS_AUTO_ENCRYPTION=on'
) | Set-Content -LiteralPath $aistorEnvPath -Encoding utf8
& icacls $aistorEnvPath /inheritance:r /grant:r $secretGrant | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to restrict permissions on $aistorEnvPath" }

Invoke-Docker -Arguments @(
    'run', '-d', '--name', $clamavName, '--network', $networkName,
    '-p', '53310:3310',
    '-v', "$clamavRoot`:/var/lib/clamav",
    $clamavImage
)

$clamavDeadline = (Get-Date).AddMinutes(5)
do {
    Start-Sleep -Seconds 5
    $clamavReachable = Test-NetConnection -ComputerName '127.0.0.1' -Port 53310 -InformationLevel Quiet
} while (-not $clamavReachable -and (Get-Date) -lt $clamavDeadline)
if (-not $clamavReachable) {
    throw 'ClamAV did not become reachable on localhost:53310 within five minutes.'
}

Invoke-Docker -Arguments @(
    'run', '-d', '--name', $aistorName, '--network', $networkName,
    '-p', '59100:9000', '-p', '59101:9001',
    '--env-file', $aistorEnvPath,
    '-v', "$aistorRoot/data`:/mnt/data",
    '-v', "$LicensePath`:/minio.license:ro",
    '-v', "$aistorCerts`:/etc/minio/certs:ro",
    $aistorImage, 'minio', 'server', '/mnt/data',
    '--license', '/minio.license',
    '--certs-dir', '/etc/minio/certs',
    '--console-address', ':9001'
)

Start-Sleep -Seconds 10
$aistorStatus = (& docker inspect -f '{{.State.Status}}' $aistorName 2>&1 | Out-String).Trim()
if ($aistorStatus -ne 'running') {
    throw "AIStor container did not remain running. Inspect with: docker logs $aistorName"
}

Write-Output 'Self-hosted Windows storage-security stack started.'
Write-Output "KMS container: $kmsName; TLS endpoint: https://localhost:57373"
Write-Output "AIStor container: $aistorName; S3 TLS endpoint: https://localhost:59100; console: https://localhost:59101"
Write-Output "ClamAV container: $clamavName; host scan endpoint: 127.0.0.1:53310"
Write-Output "Runtime data is outside the repository at: $RuntimeRoot"
Write-Output 'Root and service API keys were written only to process-local variables and the protected AIStor environment file; they were not printed.'
Write-Output 'Next gate: run the isolated storage adapter verification with the Mohamy API and worker still stopped.'
