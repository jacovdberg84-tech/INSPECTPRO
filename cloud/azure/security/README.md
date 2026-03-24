# Executive Access Hardening (Phase 1)

## Objective
Ensure only authorized executive viewers can access cloud dashboard endpoints.

## Controls
- Entra ID authentication enabled on API and web apps.
- API role gate enforced: `ExecutiveViewer`.
- API shared secret (`EXEC_VIEWER_TOKEN`) loaded from Key Vault.
- Read-only SQL credentials for API.
- HTTPS-only and TLS 1.2+.

## App settings (API)
- `REQUIRE_ROLE_GATE=true`
- `EXEC_VIEWER_TOKEN=@Microsoft.KeyVault(SecretUri=<secret-uri>)`
- `AZURE_SQL_CONNECTION_STRING=@Microsoft.KeyVault(SecretUri=<secret-uri>)`

## Entra app roles
Create app role:
- Display name: `Executive Viewer`
- Value: `ExecutiveViewer`
- Allowed member types: Users/Groups

Assign only approved directors/shareholders or an Entra group.

## Minimum endpoint exposure
- Expose only:
  - `/health`
  - `/api/dashboard/*` read-only routes
- Do not expose any write or admin endpoints publicly.

## SQL hardening
- Create SQL login/user for API with read-only rights:
  - SELECT on reporting schema
  - No INSERT/UPDATE/DELETE

## Monitoring alerts
- Alert if:
  - auth failures spike
  - ingest staleness > 15 minutes
  - API health fails
