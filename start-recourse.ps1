$ErrorActionPreference = 'Stop'
$proc = Start-Process -FilePath "npx.cmd" -ArgumentList "tsx","server.ts" -WorkingDirectory "C:\Users\User\Downloads\recourse" -NoNewWindow -PassThru -RedirectStandardOutput "C:\Users\User\Downloads\recourse\recourse-dev.log" -RedirectStandardError "C:\Users\User\Downloads\recourse\recourse-dev.err"
Write-Host "PID: $($proc.Id)"
$proc.Id | Out-File "C:\Users\User\Downloads\recourse\recourse.pid"
Start-Sleep 60
