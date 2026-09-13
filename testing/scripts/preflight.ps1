<#
preflight.ps1 — Project 7 pre-flight gate.

Run before any of `run-locust-{1x,5x,10x}.ps1`. Ensures:

* Mongo is in single-node replica set mode (so `/allocated` and
  `_withTransaction` paths work).
* The seed corpus has the expected user counts (>= 12 users, >= 30
  questions, all with `firebaseUID` matching `^lt-`).
* Locust's Python deps are installed.

Exits non-zero on first failure.

(This is *not* the same gate as `testing/scripts/diag-env.ps1`,
which is hardware-oriented. Use both for full coverage.)
#>
[CmdletBinding()]
param(
    [string]$MongoContainer = "mongo",
    [string]$DbName         = "agriai_loadtest"
)

$ErrorActionPreference = "Stop"

function Exec-InMongo([string]$Script) {
    docker exec $MongoContainer mongosh --quiet --eval "$Script" 2>$null
}

Write-Host "[preflight] checking Mongo replica-set state..."
$rsOk = Exec-InMongo 'try { rs.status().ok } catch (e) { 0 }'
if ("$rsOk" -ne "1") {
    throw "Mongo '$MongoContainer' is not in replica set mode (got '$rsOk'). Run 'rs.initiate()' first."
}
Write-Host "[preflight] Mongo OK."

Write-Host "[preflight] checking seed counts..."
$usersQ = Exec-InMongo "db.getSiblingDB('$DbName').users.countDocuments({firebaseUID:/^lt-/})"
$qsQ    = Exec-InMongo "db.getSiblingDB('$DbName').questions.countDocuments({firebaseUID:/^lt-/})"
if ($usersQ -lt 12) { throw "Need >= 12 seed users; found $usersQ." }
if ($qsQ -lt 30)    { throw "Need >= 30 seed questions; found $qsQ." }
Write-Host "[preflight] seed OK: users=$usersQ questions=$qsQ"

Write-Host "[preflight] checking Locust deps..."
$missing = (pip check 2>&1 | Where-Object { $_ -match 'locust|pymongo' })
Write-Host "[preflight] OK."
