# Azure Foundation Provisioning

This folder provisions the base Azure footprint for the executive cloud mirror.

## Resources created
- Log Analytics workspace
- Application Insights
- Storage account with:
  - `mirror-inbound` container
  - `mirror-archive` container
- Azure SQL server + `inspectpro_reporting` database
- App Service plan
- API Web App
- Executive dashboard Web App
- Function App (ingest worker host)
- Key Vault (RBAC mode)

## Prerequisites
- Azure CLI installed and logged in
- Permission to create resources in the target subscription

## Deploy
From this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-foundation.ps1 `
  -SubscriptionId "<subscription-id>" `
  -ResourceGroupName "rg-inspectpro-prod" `
  -Location "southafricanorth" `
  -NamePrefix "inspectpro" `
  -Environment "prod" `
  -SqlAdminLogin "inspectproadmin" `
  -SqlAdminPassword "<strong-password>"
```

## Notes
- This is intentionally a Phase 1 baseline. Scale tiers can be increased after pilot.
- Post-deploy app settings, identity role assignments, and Entra app configuration are handled in later rollout phases.
