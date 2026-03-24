import crypto from "node:crypto";
import sql from "mssql";

function hashKey(parts) {
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex");
}

async function upsertKpiDaily(tx, date, batchId, assets) {
  for (const row of assets || []) {
    await tx.request()
      .input("work_date", sql.Date, date)
      .input("asset_id", sql.Int, Number(row.asset_id || 0))
      .input("asset_code", sql.NVarChar(60), String(row.asset_code || "Unknown"))
      .input("asset_name", sql.NVarChar(160), String(row.asset_name || "Unknown Asset"))
      .input("scheduled_hours", sql.Decimal(10, 2), Number(row.scheduled_hours || 0))
      .input("available_hours", sql.Decimal(10, 2), Number(row.available_hours || 0))
      .input("hours_run", sql.Decimal(10, 2), Number(row.hours_run || 0))
      .input("downtime_hours", sql.Decimal(10, 2), Number(row.downtime_hours || 0))
      .input("breakdown_count", sql.Int, Number(row.breakdown_count || 0))
      .input("availability_pct", sql.Decimal(6, 2), row.availability == null ? null : Number(row.availability))
      .input("utilization_pct", sql.Decimal(6, 2), row.utilization == null ? null : Number(row.utilization))
      .input("uptime_pct", sql.Decimal(6, 2), row.uptime_pct == null ? null : Number(row.uptime_pct))
      .input("status", sql.NVarChar(40), String(row.status || "UNKNOWN"))
      .input("source_batch_id", sql.NVarChar(120), batchId)
      .query(`
        MERGE dbo.kpi_daily AS t
        USING (SELECT @work_date AS work_date, @asset_id AS asset_id) s
        ON t.work_date = s.work_date AND t.asset_id = s.asset_id
        WHEN MATCHED THEN UPDATE SET
          asset_code = @asset_code, asset_name = @asset_name, scheduled_hours = @scheduled_hours,
          available_hours = @available_hours, hours_run = @hours_run, downtime_hours = @downtime_hours,
          breakdown_count = @breakdown_count, availability_pct = @availability_pct,
          utilization_pct = @utilization_pct, uptime_pct = @uptime_pct, status = @status,
          source_batch_id = @source_batch_id, last_synced_utc = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          work_date, asset_id, asset_code, asset_name, scheduled_hours, available_hours, hours_run,
          downtime_hours, breakdown_count, availability_pct, utilization_pct, uptime_pct, status, source_batch_id
        ) VALUES (
          @work_date, @asset_id, @asset_code, @asset_name, @scheduled_hours, @available_hours, @hours_run,
          @downtime_hours, @breakdown_count, @availability_pct, @utilization_pct, @uptime_pct, @status, @source_batch_id
        );
      `);
  }
}

async function upsertSimpleDateRows(tx, tableName, dateColumn, batchId, rows, mapFn) {
  for (const item of rows || []) {
    await mapFn(tx, item, batchId, tableName, dateColumn);
  }
}

async function upsertServiceReminders(tx, date, batchId, reminders) {
  for (const r of reminders || []) {
    await tx.request()
      .input("snapshot_date", sql.Date, date)
      .input("plan_id", sql.Int, Number(r.plan_id || 0))
      .input("asset_id", sql.Int, r.asset_id == null ? null : Number(r.asset_id))
      .input("asset_code", sql.NVarChar(60), String(r.asset_code || "Unknown"))
      .input("asset_name", sql.NVarChar(160), String(r.asset_name || "Unknown Asset"))
      .input("service_name", sql.NVarChar(160), String(r.service_name || "Planned Service"))
      .input("interval_hours", sql.Decimal(10, 2), Number(r.interval_hours || 0))
      .input("current_hours", sql.Decimal(10, 2), Number(r.current_hours || 0))
      .input("due_at_hours", sql.Decimal(10, 2), r.due_at_hours == null ? null : Number(r.due_at_hours))
      .input("hours_remaining", sql.Decimal(10, 2), r.hours_remaining == null ? null : Number(r.hours_remaining))
      .input("status", sql.NVarChar(40), String(r.status || "UNKNOWN"))
      .input("source_batch_id", sql.NVarChar(120), batchId)
      .query(`
        MERGE dbo.service_reminders AS t
        USING (SELECT @snapshot_date AS snapshot_date, @plan_id AS plan_id) s
        ON t.snapshot_date = s.snapshot_date AND t.plan_id = s.plan_id
        WHEN MATCHED THEN UPDATE SET
          asset_id=@asset_id, asset_code=@asset_code, asset_name=@asset_name, service_name=@service_name,
          interval_hours=@interval_hours, current_hours=@current_hours, due_at_hours=@due_at_hours,
          hours_remaining=@hours_remaining, status=@status, source_batch_id=@source_batch_id,
          last_synced_utc=SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          snapshot_date, plan_id, asset_id, asset_code, asset_name, service_name, interval_hours,
          current_hours, due_at_hours, hours_remaining, status, source_batch_id
        ) VALUES (
          @snapshot_date, @plan_id, @asset_id, @asset_code, @asset_name, @service_name, @interval_hours,
          @current_hours, @due_at_hours, @hours_remaining, @status, @source_batch_id
        );
      `);
  }
}

async function upsertDataQuality(tx, date, batchId, anomalies) {
  for (const a of anomalies || []) {
    const issueKey = hashKey([String(date), String(a.code || ""), String(a.asset_id ?? "na"), String(a.detail || "")]);
    await tx.request()
      .input("snapshot_date", sql.Date, date)
      .input("issue_key", sql.NVarChar(180), issueKey)
      .input("severity", sql.NVarChar(20), String(a.severity || "low"))
      .input("code", sql.NVarChar(80), String(a.code || "ISSUE"))
      .input("asset_id", sql.Int, a.asset_id == null ? null : Number(a.asset_id))
      .input("asset_code", sql.NVarChar(60), a.asset_code == null ? null : String(a.asset_code))
      .input("asset_name", sql.NVarChar(160), a.asset_name == null ? null : String(a.asset_name))
      .input("detail", sql.NVarChar(400), String(a.detail || ""))
      .input("source_batch_id", sql.NVarChar(120), batchId)
      .query(`
        MERGE dbo.data_quality_alerts AS t
        USING (SELECT @snapshot_date AS snapshot_date, @issue_key AS issue_key) s
        ON t.snapshot_date = s.snapshot_date AND t.issue_key = s.issue_key
        WHEN MATCHED THEN UPDATE SET
          severity=@severity, code=@code, asset_id=@asset_id, asset_code=@asset_code, asset_name=@asset_name,
          detail=@detail, source_batch_id=@source_batch_id, last_synced_utc=SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          snapshot_date, issue_key, severity, code, asset_id, asset_code, asset_name, detail, source_batch_id
        ) VALUES (
          @snapshot_date, @issue_key, @severity, @code, @asset_id, @asset_code, @asset_name, @detail, @source_batch_id
        );
      `);
  }
}

async function upsertOperations(tx, date, batchId, operations) {
  const totals = operations?.totals || {};
  await tx.request()
    .input("op_date", sql.Date, date)
    .input("tonnes_moved", sql.Decimal(18, 2), Number(totals.tonnes_moved || 0))
    .input("product_produced", sql.Decimal(18, 2), Number(totals.product_produced || 0))
    .input("amount_produced", sql.Decimal(18, 2), Number(totals.amount_produced || 0))
    .input("total_truck_loads", sql.Int, Number(totals.total_truck_loads || 0))
    .input("source_batch_id", sql.NVarChar(120), batchId)
    .query(`
      MERGE dbo.operations_summary AS t
      USING (SELECT @op_date AS op_date) s
      ON t.op_date = s.op_date
      WHEN MATCHED THEN UPDATE SET
        tonnes_moved=@tonnes_moved, product_produced=@product_produced, amount_produced=@amount_produced,
        total_truck_loads=@total_truck_loads, source_batch_id=@source_batch_id, last_synced_utc=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (
        op_date, tonnes_moved, product_produced, amount_produced, total_truck_loads, source_batch_id
      ) VALUES (
        @op_date, @tonnes_moved, @product_produced, @amount_produced, @total_truck_loads, @source_batch_id
      );
    `);

  for (const row of operations?.product_client_breakdown || []) {
    const rowKey = hashKey([String(date), String(row.product_type || ""), String(row.client_name || "")]);
    await tx.request()
      .input("op_date", sql.Date, date)
      .input("row_key", sql.NVarChar(180), rowKey)
      .input("product_type", sql.NVarChar(120), String(row.product_type || "Unknown Product"))
      .input("client_name", sql.NVarChar(160), String(row.client_name || "Unspecified Client"))
      .input("truck_loads", sql.Int, Number(row.truck_loads || 0))
      .input("amount_produced", sql.Decimal(18, 2), Number(row.amount_produced || 0))
      .input("source_batch_id", sql.NVarChar(120), batchId)
      .query(`
        MERGE dbo.operations_breakdown AS t
        USING (SELECT @op_date AS op_date, @row_key AS row_key) s
        ON t.op_date = s.op_date AND t.row_key = s.row_key
        WHEN MATCHED THEN UPDATE SET
          product_type=@product_type, client_name=@client_name, truck_loads=@truck_loads,
          amount_produced=@amount_produced, source_batch_id=@source_batch_id, last_synced_utc=SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          op_date, row_key, product_type, client_name, truck_loads, amount_produced, source_batch_id
        ) VALUES (
          @op_date, @row_key, @product_type, @client_name, @truck_loads, @amount_produced, @source_batch_id
        );
      `);
  }
}

async function upsertAlertCenter(tx, date, batchId, alertCenter) {
  for (const a of alertCenter?.alerts || []) {
    const alertKey = hashKey([String(date), String(a.type || ""), String(a.asset_id ?? "na"), String(a.title || "")]);
    await tx.request()
      .input("snapshot_date", sql.Date, date)
      .input("alert_key", sql.NVarChar(180), alertKey)
      .input("alert_type", sql.NVarChar(80), String(a.type || "ALERT"))
      .input("severity", sql.NVarChar(20), String(a.severity || "high"))
      .input("asset_id", sql.Int, a.asset_id == null ? null : Number(a.asset_id))
      .input("asset_code", sql.NVarChar(60), a.asset_code == null ? null : String(a.asset_code))
      .input("asset_name", sql.NVarChar(160), a.asset_name == null ? null : String(a.asset_name))
      .input("title", sql.NVarChar(200), String(a.title || "Alert"))
      .input("detail", sql.NVarChar(400), String(a.detail || ""))
      .input("source_batch_id", sql.NVarChar(120), batchId)
      .query(`
        MERGE dbo.alert_center AS t
        USING (SELECT @snapshot_date AS snapshot_date, @alert_key AS alert_key) s
        ON t.snapshot_date = s.snapshot_date AND t.alert_key = s.alert_key
        WHEN MATCHED THEN UPDATE SET
          alert_type=@alert_type, severity=@severity, asset_id=@asset_id, asset_code=@asset_code, asset_name=@asset_name,
          title=@title, detail=@detail, source_batch_id=@source_batch_id, last_synced_utc=SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          snapshot_date, alert_key, alert_type, severity, asset_id, asset_code, asset_name, title, detail, source_batch_id
        ) VALUES (
          @snapshot_date, @alert_key, @alert_type, @severity, @asset_id, @asset_code, @asset_name, @title, @detail, @source_batch_id
        );
      `);
  }

  const rel = alertCenter?.reliability || {};
  await tx.request()
    .input("metric_date", sql.Date, date)
    .input("mtbf_hours", sql.Decimal(10, 2), rel.mtbf_hours == null ? null : Number(rel.mtbf_hours))
    .input("mttr_hours", sql.Decimal(10, 2), rel.mttr_hours == null ? null : Number(rel.mttr_hours))
    .input("source_table", sql.NVarChar(120), rel.source_table == null ? null : String(rel.source_table))
    .input("source_batch_id", sql.NVarChar(120), batchId)
    .query(`
      MERGE dbo.reliability_daily AS t
      USING (SELECT @metric_date AS metric_date) s
      ON t.metric_date = s.metric_date
      WHEN MATCHED THEN UPDATE SET
        mtbf_hours=@mtbf_hours, mttr_hours=@mttr_hours, source_table=@source_table,
        source_batch_id=@source_batch_id, last_synced_utc=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (
        metric_date, mtbf_hours, mttr_hours, source_table, source_batch_id
      ) VALUES (
        @metric_date, @mtbf_hours, @mttr_hours, @source_table, @source_batch_id
      );
    `);
}

export async function ingestPayload(payload, fileName = "manual.json", fileHash = "manual") {
  const db = await sql.connect(process.env.AZURE_SQL_CONNECTION_STRING);
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const date = payload.date;
    const batchId = payload.batch_id;
    const exportedAt = payload.exported_at_utc;
    const sourceHost = payload.source_host || null;
    const p = payload.payload || {};

    await tx.request()
      .input("batch_id", sql.NVarChar(120), batchId)
      .input("source_host", sql.NVarChar(120), sourceHost)
      .input("exported_at_utc", sql.DateTime2, new Date(exportedAt))
      .input("file_name", sql.NVarChar(260), fileName)
      .input("file_sha256", sql.NVarChar(128), fileHash)
      .input("status", sql.NVarChar(20), "processing")
      .query(`
        MERGE dbo.ingest_batches AS t
        USING (SELECT @batch_id AS batch_id, @file_sha256 AS file_sha256) s
        ON t.batch_id = s.batch_id AND t.file_sha256 = s.file_sha256
        WHEN MATCHED THEN UPDATE SET status = @status
        WHEN NOT MATCHED THEN INSERT (
          batch_id, source_host, exported_at_utc, file_name, file_sha256, status
        ) VALUES (
          @batch_id, @source_host, @exported_at_utc, @file_name, @file_sha256, @status
        );
      `);

    await upsertKpiDaily(tx, date, batchId, p.kpi_daily?.assets || []);

    await upsertSimpleDateRows(tx, "weekly_trend_daily", "trend_date", batchId, p.weekly_trend?.trend || [], async (trx, d, sourceBatchId) => {
      await trx.request()
        .input("trend_date", sql.Date, d.date)
        .input("scheduled_hours", sql.Decimal(10, 2), Number(d.scheduled_hours || 0))
        .input("available_hours", sql.Decimal(10, 2), Number(d.available_hours || 0))
        .input("hours_run", sql.Decimal(10, 2), Number(d.hours_run || 0))
        .input("downtime_hours", sql.Decimal(10, 2), Number(d.downtime_hours || 0))
        .input("breakdown_count", sql.Int, Number(d.breakdown_count || 0))
        .input("availability_pct", sql.Decimal(6, 2), d.availability == null ? null : Number(d.availability))
        .input("utilization_pct", sql.Decimal(6, 2), d.utilization == null ? null : Number(d.utilization))
        .input("uptime_pct", sql.Decimal(6, 2), d.uptime_pct == null ? null : Number(d.uptime_pct))
        .input("source_batch_id", sql.NVarChar(120), sourceBatchId)
        .query(`
          MERGE dbo.weekly_trend_daily AS t
          USING (SELECT @trend_date AS trend_date) s
          ON t.trend_date = s.trend_date
          WHEN MATCHED THEN UPDATE SET
            scheduled_hours=@scheduled_hours, available_hours=@available_hours, hours_run=@hours_run,
            downtime_hours=@downtime_hours, breakdown_count=@breakdown_count, availability_pct=@availability_pct,
            utilization_pct=@utilization_pct, uptime_pct=@uptime_pct, source_batch_id=@source_batch_id,
            last_synced_utc=SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT (
            trend_date, scheduled_hours, available_hours, hours_run, downtime_hours, breakdown_count,
            availability_pct, utilization_pct, uptime_pct, source_batch_id
          ) VALUES (
            @trend_date, @scheduled_hours, @available_hours, @hours_run, @downtime_hours, @breakdown_count,
            @availability_pct, @utilization_pct, @uptime_pct, @source_batch_id
          );
        `);
    });
    await upsertServiceReminders(tx, date, batchId, p.service_reminders?.reminders || []);
    await upsertDataQuality(tx, date, batchId, p.data_quality?.anomalies || []);
    await upsertOperations(tx, date, batchId, p.operations_summary || {});
    await upsertAlertCenter(tx, date, batchId, p.alert_center || {});

    // Mark batch complete.
    await tx.request()
      .input("batch_id", sql.NVarChar(120), batchId)
      .input("file_sha256", sql.NVarChar(128), fileHash)
      .input("status", sql.NVarChar(20), "completed")
      .query(`
        UPDATE dbo.ingest_batches
        SET status = @status, rows_total = rows_total + 1
        WHERE batch_id = @batch_id AND file_sha256 = @file_sha256
      `);

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  } finally {
    await db.close();
  }
}

// Local test runner (same logic used in Azure Function wrapper).
if (process.argv[2] === "--file" && process.argv[3]) {
  const fs = await import("node:fs/promises");
  const content = await fs.readFile(process.argv[3], "utf8");
  const payload = JSON.parse(content);
  const digest = crypto.createHash("sha256").update(content).digest("hex");
  await ingestPayload(payload, process.argv[3], digest);
  console.log("Ingest complete");
}
