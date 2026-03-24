# On-Prem Export Pipeline

This pipeline exports dashboard payloads from local InspectPro API and uploads to Azure Blob (`mirror-inbound`) every 10 minutes.

## Files
- `scripts/export-executive-mirror.mjs` - exporter and uploader
- `scripts/export-executive-mirror.config.example.json` - config template
- `scripts/run-executive-export.ps1` - Task Scheduler runner
- `scripts/task-executive-export.xml` - importable task definition

## Setup
1. Copy config template:
   - `copy scripts\export-executive-mirror.config.example.json scripts\export-executive-mirror.config.json`
2. Fill:
   - `azure_storage_account`
   - `azure_storage_key` (or rely on `az login` context if allowed by policy)
3. Run a manual export test:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-executive-export.ps1
```

## Task Scheduler import
```powershell
schtasks /Create /TN "InspectPro-Executive-Export" /XML "C:\INSPECTPRO\scripts\task-executive-export.xml" /F
```

## Retry behavior
- If upload fails, JSON remains in spool directory (`C:\INSPECTPRO\cloud\spool`).
- Next task run can retry by reusing/resubmitting failed files (recommended enhancement: add replay sweep job).
