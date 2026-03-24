# Executive Mirror Data Contract (v1)

This contract defines the payload exported from on-prem and ingested in Azure for the executive mirror.

## Envelope
Each export file is JSON with this envelope:

```json
{
  "contract_version": "1.0",
  "batch_id": "2026-03-24T10:20:00Z-hostname",
  "source_host": "HOSTNAME",
  "exported_at_utc": "2026-03-24T10:20:05.123Z",
  "date": "2026-03-24",
  "payload": { }
}
```

## Payload sections

### 1) `kpi_daily.assets[]`
- `asset_id` number
- `asset_code` string
- `asset_name` string
- `scheduled_hours` number
- `available_hours` number
- `hours_run` number
- `downtime_hours` number
- `breakdown_count` number
- `availability` number|null
- `utilization` number|null
- `uptime_pct` number|null
- `status` string

### 2) `weekly_trend.trend[]`
- `date` string (`YYYY-MM-DD`)
- `scheduled_hours` number
- `available_hours` number
- `hours_run` number
- `downtime_hours` number
- `breakdown_count` number
- `availability` number|null
- `utilization` number|null
- `uptime_pct` number|null

### 3) `service_reminders.reminders[]`
- `plan_id` number
- `asset_id` number|null
- `asset_code` string
- `asset_name` string
- `service_name` string
- `interval_hours` number
- `current_hours` number
- `due_at_hours` number|null
- `hours_remaining` number|null
- `status` string

### 4) `data_quality.anomalies[]`
- `severity` string (`high|medium|low`)
- `code` string
- `asset_id` number|null
- `asset_code` string|null
- `asset_name` string|null
- `detail` string

### 5) `operations_summary`
- `totals` object:
  - `tonnes_moved` number
  - `product_produced` number
  - `amount_produced` number
  - `total_truck_loads` number
- `product_client_breakdown[]`:
  - `product_type` string
  - `client_name` string
  - `truck_loads` number
  - `amount_produced` number

### 6) `alert_center`
- `summary` object:
  - `critical_total` number
  - `high_total` number
  - `overdue_services` number
  - `repeated_component_failures` number
- `reliability` object:
  - `available` boolean
  - `source_table` string|null
  - `mtbf_hours` number|null
  - `mttr_hours` number|null
- `alerts[]`:
  - `type` string
  - `severity` string
  - `asset_id` number|null
  - `asset_code` string|null
  - `asset_name` string|null
  - `title` string
  - `detail` string

## Idempotency keys
- Batch-level dedupe: `batch_id + file_sha256`
- Row-level dedupe:
  - KPI: `work_date + asset_id`
  - Weekly trend: `trend_date`
  - Service reminders: `snapshot_date + plan_id`
  - Data quality: `snapshot_date + (code + asset_id + detail hash)`
  - Operations summary: `op_date`
  - Operations breakdown: `op_date + (product_type + client_name)`
  - Alert center: `snapshot_date + (type + asset_id + title hash)`
  - Reliability: `metric_date`

## Compatibility guidance
- New fields may be added without breaking ingestion.
- Existing required fields must remain present.
- Contract version increments on breaking changes.
