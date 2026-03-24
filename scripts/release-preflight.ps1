param(
  [string]$BaseUrl = "http://localhost:3002"
)

$ErrorActionPreference = "Stop"

function Test-Endpoint {
  param(
    [string]$Name,
    [string]$Url
  )

  try {
    $null = Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec 10
    Write-Host "[OK] $Name -> $Url" -ForegroundColor Green
    return $true
  } catch {
    Write-Host "[FAIL] $Name -> $Url" -ForegroundColor Red
    Write-Host "       $($_.Exception.Message)" -ForegroundColor Red
    return $false
  }
}

Write-Host "InspectPro release preflight"
Write-Host "Base URL: $BaseUrl"
Write-Host "----------------------------------------"

$today = Get-Date -Format "yyyy-MM-dd"
$checks = @(
  @{ Name = "API health"; Url = "$BaseUrl/health" },
  @{ Name = "Assets list"; Url = "$BaseUrl/api/assets" },
  @{ Name = "Daily KPI"; Url = "$BaseUrl/api/dashboard/kpi/daily?date=$today" },
  @{ Name = "Weekly trend"; Url = "$BaseUrl/api/dashboard/kpi/weekly-trend?end_date=$today&days=7" },
  @{ Name = "Service reminders"; Url = "$BaseUrl/api/dashboard/service/reminders" }
)

$allGood = $true
foreach ($check in $checks) {
  $ok = Test-Endpoint -Name $check.Name -Url $check.Url
  if (-not $ok) {
    $allGood = $false
  }
}

Write-Host "----------------------------------------"
if ($allGood) {
  Write-Host "Preflight passed. Ready for release tag." -ForegroundColor Green
  exit 0
}

Write-Host "Preflight failed. Fix issues before release." -ForegroundColor Red
exit 1
