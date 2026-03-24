# InspectPro LAN Production Checklist

## 1) Host PC baseline
- Choose one always-on Windows PC as host.
- Set static LAN IP (recommended) or DHCP reservation on router.
- Disable sleep for this machine.
- Confirm folders exist:
  - `C:\INSPECTPRO`
  - `C:\IRONLOG\api\db`

## 2) Environment confirmation
- In `C:\INSPECTPRO\.env` confirm:
  - `PORT=3002`
  - `DB_PATH=C:\IRONLOG\api\db\ironlog.db`

## 3) Start and verify services
- Start InspectPro API/web:
  - `cd C:\INSPECTPRO`
  - `node api/server.js`
- Run checks:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\health-check.ps1`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\release-preflight.ps1`

## 4) LAN access
- From host:
  - `http://localhost:3002/dashboard.html`
  - `http://localhost:3002/ops.html`
- From another device on LAN:
  - `http://<HOST-IP>:3002/dashboard.html`
  - `http://<HOST-IP>:3002/ops.html`

## 5) Firewall rule (if needed)
- Open inbound TCP on port `3002` for private network profiles.
- Restrict to LAN/private profile only.

## 6) Backups
- Use script:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\backup-ironlog-db.ps1`
- Confirm backup output under:
  - `C:\INSPECTPRO\backups`
- Keep at least 14 daily backups.

## 7) Startup automation
- Use script:
  - `C:\INSPECTPRO\scripts\start-inspectpro-server.cmd`
- Create Task Scheduler task:
  - Trigger: At startup
  - Run whether user is logged in or not
  - Action: Start the command above

## 8) Daily operations routine
- Open `ops.html` and run Morning Ops Check.
- If any high-severity data quality issue appears, review dashboard alerts before decisions.

## 9) Incident quick actions
- If dashboard fails:
  - restart server
  - run `release-preflight.ps1`
- If DB mismatch/sync concern:
  - verify `.env` DB path still points to `C:\IRONLOG\api\db\ironlog.db`
  - run backup before any schema/data work
