param(
  [Parameter(Mandatory = $true)][string]$SubscriptionId,
  [Parameter(Mandatory = $true)][string]$ResourceGroupName,
  [Parameter(Mandatory = $true)][string]$Location,
  [Parameter(Mandatory = $true)][string]$NamePrefix,
  [Parameter(Mandatory = $true)][string]$Environment,
  [Parameter(Mandatory = $true)][string]$SqlAdminLogin,
  [Parameter(Mandatory = $true)][string]$SqlAdminPassword
)

$ErrorActionPreference = "Stop"

Write-Host "Setting Azure subscription..."
az account set --subscription $SubscriptionId

Write-Host "Ensuring resource group exists..."
az group create `
  --name $ResourceGroupName `
  --location $Location | Out-Null

Write-Host "Deploying foundation resources..."
$deploymentName = "inspectpro-foundation-$Environment-$(Get-Date -Format 'yyyyMMddHHmmss')"

az deployment group create `
  --name $deploymentName `
  --resource-group $ResourceGroupName `
  --template-file ".\main.bicep" `
  --parameters environment=$Environment `
               location=$Location `
               namePrefix=$NamePrefix `
               sqlAdminLogin=$SqlAdminLogin `
               sqlAdminPassword=$SqlAdminPassword

Write-Host "Foundation deployment complete."
