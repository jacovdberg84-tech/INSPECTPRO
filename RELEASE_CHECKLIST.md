# InspectPro Release / Rollback Checklist

## Versioning and release tag
- Pick a version number (example: `v1.0.0`).
- Confirm commit history is clean:
  - `git status`
- Create annotated tag:
  - `git tag -a v1.0.0 -m "InspectPro manager dashboard + integration hardening"`
- Verify tags:
  - `git tag --list`

## Pre-release checks
- Confirm `.env` points to shared database:
  - `PORT=3002`
  - `DB_PATH=C:\IRONLOG\api\db\ironlog.db`
- Confirm server starts without errors: `node api/server.js`
- Run health check script:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\health-check.ps1`
- Run release preflight script:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\release-preflight.ps1`
- Open and verify:
  - `http://localhost:3002/`
  - `http://localhost:3002/artisan.html`
  - `http://localhost:3002/supervisor.html`
  - `http://localhost:3002/dashboard.html`

## Smoke test flow
- Submit one operator inspection with hour meter and confirm success.
- Submit a second inspection on same asset from another operator and confirm warning banner appears.
- Verify IRONLOG sees updated live hours from shared DB.
- Generate maintenance work orders in IRONLOG and confirm no duplicate click behavior.

## Restart steps
- Stop existing process in terminal (`Ctrl+C`).
- Start server:
  - `cd C:\INSPECTPRO`
  - `node api/server.js`
- Hard refresh browser (`Ctrl+F5`) to ensure latest JS/CSS loads.

## Rollback quick plan
- Keep previous working copy of edited files:
  - `api/routes/inspections.routes.js`
  - `api/routes/breakdowns.routes.js`
  - `api/routes/dashboard.routes.js`
  - `web/app.js`
  - `web/dashboard.js`
  - `web/index.html`
  - `web/dashboard.html`
  - `web/styles.css`
- If immediate rollback is needed:
  - restore previous versions of the files above
  - restart server
  - run health check script again

## Optional publish (if remote exists)
- Push branch and tags:
  - `git push`
  - `git push --tags`

## LAN operations companion
- For day-to-day host PC setup, backups, and startup automation, see:
  - `LAN_PRODUCTION_CHECKLIST.md`
