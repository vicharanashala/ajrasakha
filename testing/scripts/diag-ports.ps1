$ports = @(9099, 3141, 27017)
foreach ($p in $ports) {
  $r = Test-NetConnection 127.0.0.1 -Port $p -InformationLevel Quiet -WarningAction SilentlyContinue
  Write-Host "127.0.0.1:$p = $r"
}
Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id, StartTime | Format-Table -AutoSize | Out-String | Write-Host