# InspectPro Cloud Mirror Kit

This directory contains Phase 1 cloud mirror implementation assets:

- `azure/foundation/` infrastructure provisioning (Bicep + deploy script)
- `azure/security/` auth and access hardening scripts/guidance
- `reporting/` reporting schema + data contract
- `export/` on-prem export pipeline guide
- `ingest/` cloud ingest logic + read-only API scaffold

## Suggested execution order
1. Deploy foundation resources.
2. Apply reporting schema.
3. Configure export job on host PC.
4. Deploy ingest function + read-only API.
5. Enable Entra access control.
6. Run reconciliation for 3 days.
7. Go live with executive users.
