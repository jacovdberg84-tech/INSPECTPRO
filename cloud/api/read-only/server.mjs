import express from "express";
import sql from "mssql";

const app = express();
const PORT = Number(process.env.PORT || 8080);
const EXEC_VIEWER_TOKEN = String(process.env.EXEC_VIEWER_TOKEN || "").trim();
const REQUIRE_ROLE_GATE = String(process.env.REQUIRE_ROLE_GATE || "true").toLowerCase() !== "false";

function authorizeExecutive(req, res, next) {
  if (!REQUIRE_ROLE_GATE) return next();
  const role = String(req.headers["x-exec-role"] || "").trim();
  const token = String(req.headers["x-exec-token"] || "").trim();
  if (role !== "ExecutiveViewer") {
    return res.status(403).json({ error: "ExecutiveViewer role required" });
  }
  if (EXEC_VIEWER_TOKEN && token !== EXEC_VIEWER_TOKEN) {
    return res.status(401).json({ error: "Invalid executive token" });
  }
  return next();
}

async function queryDb(query, bind = {}) {
  const db = await sql.connect(process.env.AZURE_SQL_CONNECTION_STRING);
  try {
    const req = db.request();
    Object.entries(bind).forEach(([k, v]) => req.input(k, v));
    const result = await req.query(query);
    return result.recordset;
  } finally {
    await db.close();
  }
}

app.get("/health", async (_req, res) => {
  try {
    await queryDb("SELECT 1 AS ok");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use("/api/dashboard", authorizeExecutive);

app.get("/api/dashboard/kpi/daily", async (req, res) => {
  const date = String(req.query.date || "").trim();
  if (!date) return res.status(400).json({ error: "date is required" });
  const assets = await queryDb(`
    SELECT asset_id, asset_code, asset_name, scheduled_hours, available_hours, hours_run,
           downtime_hours, breakdown_count, availability_pct AS availability,
           utilization_pct AS utilization, uptime_pct, status
    FROM dbo.kpi_daily
    WHERE work_date = @date
    ORDER BY asset_code
  `, { date });
  res.json({ assets, top_failures: [] });
});

app.get("/api/dashboard/service/reminders", async (req, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  const reminders = await queryDb(`
    SELECT plan_id, asset_id, asset_code, asset_name, service_name, interval_hours, current_hours,
           due_at_hours, hours_remaining, status
    FROM dbo.service_reminders
    WHERE snapshot_date = @date
    ORDER BY asset_code, plan_id
  `, { date });
  res.json({ reminders });
});

app.get("/api/dashboard/kpi/weekly-trend", async (req, res) => {
  const endDate = String(req.query.end_date || new Date().toISOString().slice(0, 10));
  const days = Math.max(3, Math.min(31, Number(req.query.days || 7)));
  const trend = await queryDb(`
    SELECT TOP (${days}) trend_date AS date, scheduled_hours, available_hours, hours_run, downtime_hours,
      breakdown_count, availability_pct AS availability, utilization_pct AS utilization, uptime_pct
    FROM dbo.weekly_trend_daily
    WHERE trend_date <= @endDate
    ORDER BY trend_date DESC
  `, { endDate });
  res.json({ end_date: endDate, days, trend: trend.reverse() });
});

app.get("/api/dashboard/operations/summary", async (req, res) => {
  const date = String(req.query.date || "").trim();
  if (!date) return res.status(400).json({ error: "date is required" });

  const totals = (await queryDb(`
    SELECT tonnes_moved, product_produced, amount_produced, total_truck_loads
    FROM dbo.operations_summary WHERE op_date = @date
  `, { date }))[0] || {
    tonnes_moved: 0,
    product_produced: 0,
    amount_produced: 0,
    total_truck_loads: 0
  };

  const product_client_breakdown = await queryDb(`
    SELECT product_type, client_name, truck_loads, amount_produced
    FROM dbo.operations_breakdown
    WHERE op_date = @date
    ORDER BY truck_loads DESC
  `, { date });

  res.json({ ok: true, date, totals, product_client_breakdown });
});

app.get("/api/dashboard/alerts/center", async (req, res) => {
  const date = String(req.query.date || "").trim();
  if (!date) return res.status(400).json({ error: "date is required" });
  const alerts = await queryDb(`
    SELECT alert_type AS type, severity, asset_id, asset_code, asset_name, title, detail
    FROM dbo.alert_center
    WHERE snapshot_date = @date
    ORDER BY CASE WHEN severity='critical' THEN 1 ELSE 2 END, asset_code
  `, { date });

  const rel = (await queryDb(`
    SELECT mtbf_hours, mttr_hours, source_table
    FROM dbo.reliability_daily WHERE metric_date = @date
  `, { date }))[0] || { mtbf_hours: null, mttr_hours: null, source_table: null };

  res.json({
    date,
    summary: {
      critical_total: alerts.filter((a) => String(a.severity) === "critical").length,
      high_total: alerts.filter((a) => String(a.severity) === "high").length,
      overdue_services: alerts.filter((a) => String(a.type) === "OVERDUE_SERVICE").length,
      repeated_component_failures: alerts.filter((a) => String(a.type) === "REPEATED_COMPONENT_FAILURE").length
    },
    reliability: {
      available: rel.mtbf_hours !== null || rel.mttr_hours !== null,
      source_table: rel.source_table,
      mtbf_hours: rel.mtbf_hours,
      mttr_hours: rel.mttr_hours
    },
    alerts
  });
});

app.listen(PORT, () => {
  console.log(`Executive read-only API listening on ${PORT}`);
});
