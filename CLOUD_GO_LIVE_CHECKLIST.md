# InspectPro Cloud Executive Mirror Go-Live Checklist

## 1) Foundation readiness
- [ ] Azure foundation deployed from `cloud/azure/foundation/main.bicep`
- [ ] Reporting DB created and schema applied from `cloud/reporting/schema.sql`
- [ ] Blob containers exist: `mirror-inbound`, `mirror-archive`
- [ ] API + Web apps deployed and healthy

## 2) Security readiness
- [ ] Entra ID auth enabled on API + Web apps
- [ ] `ExecutiveViewer` role configured and assigned
- [ ] Key Vault contains:
  - [ ] SQL connection string
  - [ ] Executive API token
- [ ] API is read-only (no write routes exposed)
- [ ] TLS/HTTPS enforced

## 3) Pipeline readiness
- [ ] Export config created from:
  - `scripts/export-executive-mirror.config.example.json`
- [ ] Manual export test passes:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\run-executive-export.ps1`
- [ ] Task Scheduler job imported and running:
  - `scripts/task-executive-export.xml`
- [ ] Spool replay script tested:
  - `node .\scripts\retry-executive-spool.mjs --config .\scripts\export-executive-mirror.config.json`

## 4) Reconciliation and SLA
- [ ] Run daily comparison for at least 3 business days:
  - `node .\scripts\reconcile-cloud-mirror.mjs 2026-03-24`
- [ ] KPI drift <= 2% across core fields
- [ ] Operations amount drift <= 2%
- [ ] Critical alert count delta <= 1
- [ ] Data freshness <= 10 minutes

## 5) Pilot and launch
- [ ] Pilot users onboarded (small leadership group)
- [ ] Pilot feedback captured and issues resolved
- [ ] Executive URL shared to approved group
- [ ] Monitoring alerts configured (API health, ingest failures, stale data)

## 6) Rollback drill (must be tested)
- [ ] Disable executive cloud URL access
- [ ] Confirm LAN dashboard remains primary truth
- [ ] Replay failed batches after fix
- [ ] Incident log and resolution documented

## 7) Operations handover
- [ ] Owner assigned for cloud mirror support
- [ ] Weekly review cadence set for reliability and freshness
- [ ] Link this with:
  - `RELEASE_CHECKLIST.md`
  - `LAN_PRODUCTION_CHECKLIST.md`
