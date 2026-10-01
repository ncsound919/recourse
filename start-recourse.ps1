$ErrorActionPreference = 'Stop'

# Path corrected 2026-09-29: the repo moved to BUSINESS\INFRASTRUCTURE\recourse
# during the dedupe sweep. The old C:\Users\User\Downloads\recourse no longer
# exists, so this script silently started nothing.
$root = 'C:\Users\User\Downloads\BUSINESS\INFRASTRUCTURE\recourse'

if (-not (Test-Path -LiteralPath $root)) {
  throw "Recourse root not found: $root"
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
