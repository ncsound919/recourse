# Recourse keepalive watchdog (2026-10-25; S0.3 evidence logging).
# Runs every 10 minutes from the Windows Scheduled Task
# "RecourseGatewayKeepalive". Boots the gateway ONLY when nothing is listening
# on the configured port; a healthy instance is never touched (its instance
# lock would refuse a second boot).
#
# The log is the S0.3 evidence: every takeover writes a "port dead" line and,
# if the boot succeeds, a "revived after Ns (pid P)" line. A failed boot is
# recorded explicitly instead of being silent.
$ErrorActionPreference = 'SilentlyContinue'

# Only honor a valid positive PORT. Some shells export PORT=0 (meaning
# "pick any free port"); polling that value made the watchdog report a healthy
# gateway as dead. The gateway itself is pinned to 3050 by start-recourse.ps1.
$port = 3050
$envPort = 0
if ($env:PORT -and [int]::TryParse($env:PORT, [ref]$envPort) -and $envPort -gt 0) { $port = $envPort }
$root = if ($PSScriptRoot) { $PSScriptRoot } else { 'C:\Users\tap45\Downloads\eco\recourse' }
$log = Join-Path $root 'keepalive.log'

function Write-KeepaliveLog([string]$message) {
  Add-Content -LiteralPath $log -Value "$(Get-Date -Format s) $message" -Encoding utf8
}

function Get-GatewayListener {
  try { return Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop } catch { return $null }
}

$listener = Get-GatewayListener
if ($listener) {
  # Healthy: log a heartbeat only when the log file grows stale (>24h) so we
  # do not spam, but ensure the file exists for the uptime ledger.
  $needLog = $true
  try { if ((Get-Item -LiteralPath $log).LastWriteTime -gt (Get-Date).AddHours(-24)) { $needLog = $false } } catch {}
  if ($needLog) { Write-KeepaliveLog "healthy (pid $($listener.OwningProcess), port $port)" }
  exit 0
}

$started = Get-Date
Write-KeepaliveLog "port $port dead -> booting gateway (pid none)"

$startScript = Join-Path $root 'start-recourse.ps1'
if (-not (Test-Path -LiteralPath $startScript)) {
  Write-KeepaliveLog "boot FAILED: start script missing at $startScript"
  exit 1
}
Start-Process -FilePath 'powershell.exe' `
  -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $startScript `
  -WindowStyle Hidden

# Cold boots have taken up to ~210 s on this checkout; wait 4 minutes before
# declaring failure. Polling is cheap and the task has no overlap guard.
for ($i = 1; $i -le 48; $i++) {
  Start-Sleep -Seconds 5
  $listener = Get-GatewayListener
  if ($listener) {
    $elapsed = [int]((Get-Date) - $started).TotalSeconds
    Write-KeepaliveLog "revived after ${elapsed}s (pid $($listener.OwningProcess), port $port)"
    exit 0
  }
}
$elapsed = [int]((Get-Date) - $started).TotalSeconds
Write-KeepaliveLog "boot FAILED: port $port not listening after ${elapsed}s"
exit 1
