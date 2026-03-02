# PowerShell Script to Create duplicate_questions Collection
# Run this script from the backend directory

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Creating duplicate_questions Collection" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Load environment variables from .env file
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    Write-Host "✅ Loaded environment variables from .env" -ForegroundColor Green
} else {
    Write-Host "⚠️  .env file not found" -ForegroundColor Yellow
}

$DB_URL = $env:DB_URL
$DB_NAME = $env:DB_NAME

if (-not $DB_URL) {
    Write-Host "❌ DB_URL not found in environment variables" -ForegroundColor Red
    Write-Host "Please set DB_URL in your .env file" -ForegroundColor Yellow
    exit 1
}

if (-not $DB_NAME) {
    Write-Host "❌ DB_NAME not found in environment variables" -ForegroundColor Red
    Write-Host "Please set DB_NAME in your .env file" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n📡 Connecting to MongoDB..." -ForegroundColor Cyan
Write-Host "   Database: $DB_NAME" -ForegroundColor Gray

# Check if mongosh is available
$mongoshPath = Get-Command mongosh -ErrorAction SilentlyContinue

if (-not $mongoshPath) {
    Write-Host "❌ mongosh not found. Please install MongoDB Shell." -ForegroundColor Red
    Write-Host "   Visit: https://www.mongodb.com/docs/mongodb-shell/install/" -ForegroundColor Yellow
    exit 1
}

# Run the MongoDB script
Write-Host "`n🚀 Executing MongoDB script..." -ForegroundColor Cyan

$scriptPath = "scripts/create-duplicate-questions-collection.js"

if (-not (Test-Path $scriptPath)) {
    Write-Host "❌ Script not found: $scriptPath" -ForegroundColor Red
    exit 1
}

# Update the database name in the script
$scriptContent = Get-Content $scriptPath -Raw
$scriptContent = $scriptContent -replace "const dbName = '[^']*';", "const dbName = '$DB_NAME';"
$tempScript = "scripts/temp-create-collection.js"
$scriptContent | Out-File -FilePath $tempScript -Encoding UTF8

try {
    & mongosh $DB_URL --quiet --file $tempScript
    Write-Host "`n✅ Collection created successfully!" -ForegroundColor Green
} catch {
    Write-Host "`n❌ Error executing script: $_" -ForegroundColor Red
    exit 1
} finally {
    # Clean up temp file
    if (Test-Path $tempScript) {
        Remove-Item $tempScript
    }
}

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "`nThe duplicate_questions collection is ready to use!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Upload test questions to test duplicate detection" -ForegroundColor Gray
Write-Host "  2. Check the collection: mongosh `"$DB_URL`" --eval `"use $DB_NAME; db.duplicate_questions.find().pretty()`"" -ForegroundColor Gray
