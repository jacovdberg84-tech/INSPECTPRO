/*
  InspectPro Executive Mirror Reporting Schema
  Target: Azure SQL Database
*/

CREATE TABLE dbo.ingest_batches (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  batch_id NVARCHAR(120) NOT NULL,
  source_host NVARCHAR(120) NULL,
  exported_at_utc DATETIME2 NOT NULL,
  received_at_utc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  file_name NVARCHAR(260) NOT NULL,
  file_sha256 NVARCHAR(128) NOT NULL,
  status NVARCHAR(20) NOT NULL,
  rows_total INT NOT NULL DEFAULT 0,
  rows_inserted INT NOT NULL DEFAULT 0,
  rows_updated INT NOT NULL DEFAULT 0,
  error_text NVARCHAR(MAX) NULL
);
CREATE UNIQUE INDEX UX_ingest_batches_batch_file ON dbo.ingest_batches(batch_id, file_sha256);

CREATE TABLE dbo.kpi_daily (
  work_date DATE NOT NULL,
  asset_id INT NOT NULL,
  asset_code NVARCHAR(60) NOT NULL,
  asset_name NVARCHAR(160) NOT NULL,
  scheduled_hours DECIMAL(10,2) NOT NULL,
  available_hours DECIMAL(10,2) NOT NULL,
  hours_run DECIMAL(10,2) NOT NULL,
  downtime_hours DECIMAL(10,2) NOT NULL,
  breakdown_count INT NOT NULL,
  availability_pct DECIMAL(6,2) NULL,
  utilization_pct DECIMAL(6,2) NULL,
  uptime_pct DECIMAL(6,2) NULL,
  status NVARCHAR(40) NOT NULL,
  source_batch_id NVARCHAR(120) NOT NULL,
  last_synced_utc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_kpi_daily PRIMARY KEY (work_date, asset_id)
);
CREATE INDEX IX_kpi_daily_asset_date ON dbo.kpi_daily(asset_code, work_date DESC);

CREATE TABLE dbo.service_reminders (
  snapshot_date DATE NOT NULL,
  plan_id INT NOT NULL,
  asset_id INT NULL,
  asset_code NVARCHAR(60) NOT NULL,
  asset_name NVARCHAR(160) NOT NULL,
  service_name NVARCHAR(160) NOT NULL,
  interval_hours DECIMAL(10,2) NOT NULL,
  current_hours DECIMAL(10,2) NOT NULL,
  due_at_hours DECIMAL(10,2) NULL,
  hours_remaining DECIMAL(10,2) NULL,
  status NVARCHAR(40) NOT NULL,
  source_batch_id NVARCHAR(120) NOT NULL,
  last_synced_utc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_service_reminders PRIMARY KEY (snapshot_date, plan_id)
);
CREATE INDEX IX_service_reminders_status ON dbo.service_reminders(snapshot_date, status);

CREATE TABLE dbo.data_quality_alerts (
  snapshot_date DATE NOT NULL,
  issue_key NVARCHAR(180) NOT NULL,
  severity NVARCHAR(20) NOT NULL,
  code NVARCHAR(80) NOT NULL,
  asset_id INT NULL,
  asset_code NVARCHAR(60) NULL,
  asset_name NVARCHAR(160) NULL,
  detail NVARCHAR(400) NOT NULL,
  source_batch_id NVARCHAR(120) NOT NULL,
  last_synced_utc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_data_quality_alerts PRIMARY KEY (snapshot_date, issue_key)
);
CREATE INDEX IX_data_quality_alerts_severity ON dbo.data_quality_alerts(snapshot_date, severity);

CREATE TABLE dbo.operations_summary (
  op_date DATE NOT NULL PRIMARY KEY,
  tonnes_moved DECIMAL(18,2) NOT NULL,
  product_produced DECIMAL(18,2) NOT NULL,
  amount_produced DECIMAL(18,2) NOT NULL,
  total_truck_loads INT NOT NULL,
  source_batch_id NVARCHAR(120) NOT NULL,
  last_synced_utc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.operations_breakdown (
  op_date DATE NOT NULL,
  row_key NVARCHAR(180) NOT NULL,
  product_type NVARCHAR(120) NOT NULL,
  client_name NVARCHAR(160) NOT NULL,
  truck_loads INT NOT NULL,
  amount_produced DECIMAL(18,2) NOT NULL,
  source_batch_id NVARCHAR(120) NOT NULL,
  last_synced_utc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_operations_breakdown PRIMARY KEY (op_date, row_key)
);

CREATE TABLE dbo.alert_center (
  snapshot_date DATE NOT NULL,
  alert_key NVARCHAR(180) NOT NULL,
  alert_type NVARCHAR(80) NOT NULL,
  severity NVARCHAR(20) NOT NULL,
  asset_id INT NULL,
  asset_code NVARCHAR(60) NULL,
  asset_name NVARCHAR(160) NULL,
  title NVARCHAR(200) NOT NULL,
  detail NVARCHAR(400) NOT NULL,
  source_batch_id NVARCHAR(120) NOT NULL,
  last_synced_utc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_alert_center PRIMARY KEY (snapshot_date, alert_key)
);
CREATE INDEX IX_alert_center_severity ON dbo.alert_center(snapshot_date, severity);

CREATE TABLE dbo.reliability_daily (
  metric_date DATE NOT NULL PRIMARY KEY,
  mtbf_hours DECIMAL(10,2) NULL,
  mttr_hours DECIMAL(10,2) NULL,
  source_table NVARCHAR(120) NULL,
  source_batch_id NVARCHAR(120) NOT NULL,
  last_synced_utc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.weekly_trend_daily (
  trend_date DATE NOT NULL PRIMARY KEY,
  scheduled_hours DECIMAL(10,2) NOT NULL,
  available_hours DECIMAL(10,2) NOT NULL,
  hours_run DECIMAL(10,2) NOT NULL,
  downtime_hours DECIMAL(10,2) NOT NULL,
  breakdown_count INT NOT NULL,
  availability_pct DECIMAL(6,2) NULL,
  utilization_pct DECIMAL(6,2) NULL,
  uptime_pct DECIMAL(6,2) NULL,
  source_batch_id NVARCHAR(120) NOT NULL,
  last_synced_utc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
