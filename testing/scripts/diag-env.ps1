Get-Content 'c:\Users\iitmd\AJRASAKHA-LOADTESTING-P7\testing\docker\backend-loadtest.env' |
  Where-Object { $_ -and ($_ -notmatch '^\s*#') } |
  ForEach-Object {
    if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
      $k = $Matches[1]
      $v = $Matches[2].Trim()
      if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
      if ($k -eq 'DB_URL') { $v = $v -replace 'mongo', '127.0.0.1' }
      Set-Item -Path "env:$k" -Value $v
    }
  }
Write-Host "DB_URL=[$env:DB_URL]"
Write-Host "DB_NAME=[$env:DB_NAME]"
Write-Host "PORT=[$env:PORT]"