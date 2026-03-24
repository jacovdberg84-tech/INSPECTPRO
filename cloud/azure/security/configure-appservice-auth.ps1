param(
  [Parameter(Mandatory = $true)][string]$ResourceGroupName,
  [Parameter(Mandatory = $true)][string]$ApiAppName,
  [Parameter(Mandatory = $true)][string]$WebAppName,
  [Parameter(Mandatory = $true)][string]$EntraClientId,
  [Parameter(Mandatory = $true)][string]$TenantId
)

$ErrorActionPreference = "Stop"

Write-Host "Configuring Entra auth on API app..."
az webapp auth update `
  --resource-group $ResourceGroupName `
  --name $ApiAppName `
  --enabled true `
  --action LoginWithAzureActiveDirectory `
  --aad-client-id $EntraClientId `
  --aad-token-issuer-url "https://login.microsoftonline.com/$TenantId/v2.0"

Write-Host "Configuring Entra auth on web app..."
az webapp auth update `
  --resource-group $ResourceGroupName `
  --name $WebAppName `
  --enabled true `
  --action LoginWithAzureActiveDirectory `
  --aad-client-id $EntraClientId `
  --aad-token-issuer-url "https://login.microsoftonline.com/$TenantId/v2.0"

Write-Host "Auth configuration complete."
