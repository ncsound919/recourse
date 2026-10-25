$ErrorActionPreference = 'Stop'

# Root for THIS checkout (2026-10-25). The previous hard-coded root
# (C:\Users\User\Downloads\BUSINESS\INFRASTRUCTURE\recourse) no longer exists,
# so the old script threw "Recourse root not found" and silently started nothing.
$root = 'C:\Users\tap45\Downloads\eco\recourse'

if (-not (Test-Path -LiteralPath $root)) {
  throw "Recourse root not found: $root"
}

# --- Kaggle credentials -----------------------------------------------------
# The CLI (2.x) needs KAGGLE_API_TOKEN (an OAuth-format access token) in the
# child environment; the legacy kaggle.json username+key form is ignored by it.
# The token lives in ~/.kaggle/kaggle.json as { username, key: "KAGT_..." }.
# We read it into the process environment here and NEVER copy it into the
# project. KAGGLE_USERNAME is the account that owns the token (from a one-time
# `kaggle kernels list --mine` probe) — recourse refuses to configure a token
# without a username, and kernel refs are username/slug.
if (-not $env:KAGGLE_API_TOKEN) {
  $kaggleJson = Join-Path $env:USERPROFILE '.kaggle\kaggle.json'
  if (Test-Path -LiteralPath $kaggleJson) {
    $parsed = Get-Content -Raw -LiteralPath $kaggleJson | ConvertFrom-Json
    if ($parsed.key) { $env:KAGGLE_API_TOKEN = [string]$parsed.key }
    if (-not $env:KAGGLE_USERNAME -and $parsed.username) { $env:KAGGLE_USERNAME = [string]$parsed.username }
  }
}
# The token file carries the profile username (tap4500), but the token itself is
# bound to the djoochie account (verified by `kaggle kernels list --mine`).
# Overriding here keeps kernel refs addressed correctly; it is not a secret.
$env:KAGGLE_USERNAME = 'djoochie'
$env:PORT = '3050'
$env:RECOURSE_HOST = '127.0.0.1'

if (-not $env:KAGGLE_API_TOKEN) {
  Write-Warning 'No Kaggle token found in ~/.kaggle/kaggle.json — gateway will run with the Kaggle platform unconfigured.'
}

$proc = Start-Process -FilePath 'npx.cmd' `
  -ArgumentList 'tsx', '--no-node-snapshot', 'server.ts' `
  -WorkingDirectory $root `
  -NoNewWindow -PassThru `
  -RedirectStandardOutput "$root\recourse-dev.log" `
  -RedirectStandardError "$root\recourse-dev.err"

Write-Host "PID: $($proc.Id)"
$proc.Id | Out-File "$root\recourse.pid"
Write-Host "Logs:  recourse-dev.log / recourse-dev.err"
$port = 3050
if ($env:PORT) { $port = [int]$env:PORT }
Write-Host "API:   http://localhost:$port"
Start-Sleep 20
