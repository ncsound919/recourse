$env:PORT = '3077'
$env:RECOURSE_SAFE_BOOT = '0'
$env:RECOURSE_ALLOW_MULTI = '1'
$env:MODEL_BASE_URL = 'http://127.0.0.1:9'
$env:SCIENCE_AXIOM_BUILD = '1'
$env:SCIENCE_KEYWIRE_HANDOFF = '1'
$env:SCIENCE_CONDUCTOR_INTERVAL_MS = '15000'
$out = 'C:\Users\User\Downloads\recourse\onc-boot.log'
$err = 'C:\Users\User\Downloads\recourse\onc-boot.err'
$p = Start-Process node -ArgumentList '--import','tsx','server.ts' -WorkingDirectory 'C:\Users\User\Downloads\recourse' -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
Write-Output "PID: $($p.Id)"
Start-Sleep -Seconds 20
try {
  $st = Invoke-RestMethod 'http://127.0.0.1:3077/api/recourse/science/status' -TimeoutSec 10
  Write-Output "science status: running=$($st.running) cycles=$($st.cyclesRun) intervalMs=$($st.intervalMs)"
  $kw = Invoke-RestMethod 'http://127.0.0.1:3077/api/recourse/keywire/status' -TimeoutSec 12
  Write-Output "keywire: online=$($kw.online) auth=$($kw.auth.configured)"
} catch {
  Write-Output "FAILED: $($_.Exception.Message)"
  if (Test-Path $err) { Get-Content $err -Tail 15 }
}