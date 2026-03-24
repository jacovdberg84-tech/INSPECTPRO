# Cloud Ingest + Read-Only API

## Components
- `function/` contains ingest logic that maps exported payloads into Azure SQL reporting tables.
- `../api/read-only/` provides a read-only API surface for executive dashboard consumption.

## Ingest function usage (local test)
1. Install deps in `cloud/ingest/function`:
   - `npm install`
2. Set env:
   - `AZURE_SQL_CONNECTION_STRING`
3. Run:

```powershell
node .\index.mjs --file "C:\INSPECTPRO\cloud\spool\sample-export.json"
```

## API usage
1. Install deps in `cloud/api/read-only`:
   - `npm install`
2. Set env:
   - `AZURE_SQL_CONNECTION_STRING`
   - `PORT=8080` (optional)
3. Run:

```powershell
node .\server.mjs
```

## Deployment note
- For Azure Functions integration, wrap `ingestPayload()` in a Blob Trigger handler and call with blob content/hash.
