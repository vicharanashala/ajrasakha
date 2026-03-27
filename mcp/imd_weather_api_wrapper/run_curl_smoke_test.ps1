param(
    [string]$BaseUrl = "http://127.0.0.1:8010"
)

$ErrorActionPreference = "Stop"
$passCount = 0
$failCount = 0

function Invoke-CurlCheck {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [string]$Body = ""
    )

    Write-Host ""
    Write-Host "Checking: $Name"
    Write-Host "URL: $Url"

    try {
        if ($Method -eq "GET") {
            $response = curl.exe -sS "$Url"
        }
        elseif ($Method -eq "POST") {
            $response = curl.exe -sS -X POST "$Url" -H "Content-Type: application/json" -d "$Body"
        }
        else {
            throw "Unsupported method: $Method"
        }

        if ($LASTEXITCODE -ne 0) {
            throw "curl exit code: $LASTEXITCODE"
        }

        $null = $response | ConvertFrom-Json
        Write-Host "PASS" -ForegroundColor Green
        $script:passCount++
    }
    catch {
        Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
        $script:failCount++
    }
}

function Enc {
    param([string]$Value)
    return [uri]::EscapeDataString($Value)
}

$city = Enc "Delhi"
$stateDelhi = Enc "Delhi"
$districtAligarh = Enc "Aligarh"
$stateUP = Enc "Uttar Pradesh"
$cityPune = Enc "Pune"
$stateMH = Enc "Maharashtra"
$districtNagpur = Enc "Nagpur"
$districtLudhiana = Enc "Ludhiana"
$statePunjab = Enc "Punjab"
$cropWheat = Enc "Wheat"
$cityLucknow = Enc "Lucknow"
$districtLucknow = Enc "Lucknow"
$cropPaddy = Enc "Paddy"
$qRain = Enc "will it rain tomorrow in my district"

Invoke-CurlCheck -Name "Root health" -Method "GET" -Url "$BaseUrl/"
Invoke-CurlCheck -Name "Detailed health" -Method "GET" -Url "$BaseUrl/health"
Invoke-CurlCheck -Name "City forecast" -Method "GET" -Url "$BaseUrl/weather/city-forecast?city=$city&state=$stateDelhi"
Invoke-CurlCheck -Name "District forecast" -Method "GET" -Url "$BaseUrl/weather/district-forecast?district=$districtAligarh&state=$stateUP"
Invoke-CurlCheck -Name "Rainfall forecast" -Method "GET" -Url "$BaseUrl/weather/rainfall-forecast?district=$districtAligarh&state=$stateUP&days=3"
Invoke-CurlCheck -Name "Current weather" -Method "GET" -Url "$BaseUrl/weather/current?city=$cityPune&state=$stateMH"
Invoke-CurlCheck -Name "Nowcast" -Method "GET" -Url "$BaseUrl/weather/nowcast?district=$districtNagpur&state=$stateMH"
Invoke-CurlCheck -Name "Agromet advisory" -Method "GET" -Url "$BaseUrl/weather/agromet-advisory?district=$districtLudhiana&state=$statePunjab&crop=$cropWheat"
Invoke-CurlCheck -Name "Full profile" -Method "GET" -Url "$BaseUrl/weather/full-profile?city=$cityLucknow&district=$districtLucknow&state=$stateUP&crop=$cropPaddy"
Invoke-CurlCheck -Name "Router single query" -Method "GET" -Url "$BaseUrl/router/query?q=$qRain"
Invoke-CurlCheck -Name "Router batch query" -Method "POST" -Url "$BaseUrl/router/batch" -Body '["will it rain tomorrow in Aligarh","current weather in Pune","crop loss due to hailstorm"]'

Write-Host ""
Write-Host "======================"
Write-Host "Smoke Test Summary"
Write-Host "PASS: $passCount"
Write-Host "FAIL: $failCount"
Write-Host "======================"

if ($failCount -gt 0) {
    exit 1
}

exit 0
