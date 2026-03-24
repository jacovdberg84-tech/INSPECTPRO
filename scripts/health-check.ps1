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
    $response = Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec 8
    Write-Host "[OK] $Name -> $Url"
    return $true
  } catch {
    Write-Host "[FAIL] $Name -> $Url" -ForegroundColor Red
    Write-Host "       $($_.Exception.Message)" -ForegroundColor Red
    return $false
  }
}

Write-Host "InspectPro health check against $BaseUrl"
Write-Host "----------------------------------------"

$checks = @(
  @{ Name = "API health"; Url = "$BaseUrl/health" },
  @{ Name = "Assets list"; Url = "$BaseUrl/api/assets" },
  @{ Name = "Dashboard reminders"; Url = "$BaseUrl/api/dashboard/service/reminders" }
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
  Write-Host "Health check passed." -ForegroundColor Green
  exit 0
}

Write-Host "Health check failed." -ForegroundColor Red
exit 1
