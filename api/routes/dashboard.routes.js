import { Router } from "express";
import { db } from "../db/client.js";

const router = Router();

function getReminderStatus(hoursRemaining, intervalHours) {
  const soonThreshold = Math.max(10, Number(intervalHours || 0) * 0.1);

  if (hoursRemaining < -soonThreshold) {
    return { status: "CRITICAL OVERDUE", sort_rank: 1 };
  }
  if (hoursRemaining < 0) {
    return { status: "OVERDUE", sort_rank: 2 };
  }
  if (hoursRemaining <= soonThreshold) {
    return { status: "DUE SOON", sort_rank: 3 };
  }
  return { status: "OK", sort_rank: 4 };
}

function pickField(row, candidates, fallback = null) {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return fallback;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatDate(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* =========================
   DAILY KPI SUMMARY
========================= */
router.get("/kpi/daily", (req, res) => {
  try {
    const date = String(req.query.date || "").trim();

    if (!date) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }

    const assets = db.prepare(`
      SELECT id, asset_code, asset_name
      FROM assets
      WHERE active = 1 AND archived = 0
      ORDER BY asset_code
    `).all();

    const results = assets.map((asset) => {
      const dh = db.prepare(`
        SELECT *
        FROM daily_hours
        WHERE asset_id = ? AND work_date = ?
      `).get(asset.id, date);

      const scheduled = Number(dh?.scheduled_hours || 0);
      const hours_run = Number(dh?.hours_run || 0);

      const downtimeRow = db.prepare(`
        SELECT COALESCE(SUM(l.hours_down), 0) AS total
        FROM breakdown_downtime_logs l
        JOIN breakdowns b ON b.id = l.breakdown_id
        WHERE b.asset_id = ?
          AND l.log_date = ?
      `).get(asset.id, date);

      const downtime = Number(downtimeRow?.total || 0);

      const bdCountRow = db.prepare(`
        SELECT COUNT(*) AS count
        FROM breakdowns
        WHERE asset_id = ?
          AND breakdown_date = ?
      `).get(asset.id, date);

      const breakdown_count = Number(bdCountRow?.count || 0);

      let uptime_pct = 0;
      if (scheduled > 0) {
        uptime_pct = ((scheduled - downtime) / scheduled) * 100;
      }

      uptime_pct = Math.max(0, Math.min(100, uptime_pct));
      const available_hours = Math.max(0, scheduled - downtime);
      const availability = scheduled > 0
        ? (available_hours / scheduled) * 100
        : null;
      const utilization = available_hours > 0
        ? (hours_run / available_hours) * 100
        : null;

      let status = "HEALTHY";
      if (uptime_pct < 70) status = "CRITICAL";
      else if (uptime_pct < 85) status = "RISK";

      return {
        asset_id: asset.id,
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        scheduled_hours: scheduled,
        hours_run,
        downtime_hours: downtime,
        available_hours: Number(available_hours.toFixed(1)),
        availability: availability === null ? null : Number(availability.toFixed(1)),
        utilization: utilization === null ? null : Number(utilization.toFixed(1)),
        breakdown_count,
        uptime_pct: Number(uptime_pct.toFixed(1)),
        status
      };
    });

    const topFailures = db.prepare(`
      SELECT
        COALESCE(component, 'Unknown') AS component,
        COUNT(*) AS count,
        COALESCE(SUM(downtime_total_hours), 0) AS downtime
      FROM breakdowns
      WHERE breakdown_date = ?
      GROUP BY COALESCE(component, 'Unknown')
      ORDER BY downtime DESC, count DESC
      LIMIT 5
    `).all(date);

    res.json({
      assets: results,
      top_failures: topFailures
    });
  } catch (err) {
    console.error("KPI error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   WEEKLY KPI TREND (FLEET)
========================= */
router.get("/kpi/weekly-trend", (req, res) => {
  try {
    const endDateRaw = String(req.query.end_date || "").trim();
    const daysRaw = Number(req.query.days || 7);
    const days = Number.isFinite(daysRaw) ? Math.max(3, Math.min(31, Math.floor(daysRaw))) : 7;

    const endDateObj = endDateRaw ? parseDateOnly(endDateRaw) : parseDateOnly(formatDate(new Date()));
    if (!endDateObj) {
      return res.status(400).json({ error: "end_date must be YYYY-MM-DD" });
    }

    const assets = db.prepare(`
      SELECT id, asset_code, asset_name
      FROM assets
      WHERE active = 1 AND archived = 0
      ORDER BY asset_code
    `).all();

    const getDailyHours = db.prepare(`
      SELECT scheduled_hours, hours_run
      FROM daily_hours
      WHERE asset_id = ? AND work_date = ?
    `);

    const getDailyDowntime = db.prepare(`
      SELECT COALESCE(SUM(l.hours_down), 0) AS total
      FROM breakdown_downtime_logs l
      JOIN breakdowns b ON b.id = l.breakdown_id
      WHERE b.asset_id = ?
        AND l.log_date = ?
    `);

    const getBreakdownCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM breakdowns
      WHERE asset_id = ?
        AND breakdown_date = ?
    `);

    const trend = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(endDateObj);
      d.setUTCDate(d.getUTCDate() - i);
      const date = formatDate(d);

      let scheduled = 0;
      let hours_run = 0;
      let downtime = 0;
      let breakdown_count = 0;

      for (const asset of assets) {
        const dh = getDailyHours.get(asset.id, date);
        const scheduledHours = Number(dh?.scheduled_hours || 0);
        const runHours = Number(dh?.hours_run || 0);
        const downHours = Number(getDailyDowntime.get(asset.id, date)?.total || 0);
        const bCount = Number(getBreakdownCount.get(asset.id, date)?.count || 0);

        scheduled += scheduledHours;
        hours_run += runHours;
        downtime += downHours;
        breakdown_count += bCount;
      }

      const clampedDowntime = Math.max(0, Math.min(downtime, scheduled > 0 ? scheduled : downtime));
      const available_hours = Math.max(0, scheduled - clampedDowntime);
      const availability = scheduled > 0 ? (available_hours / scheduled) * 100 : null;
      const utilization = available_hours > 0 ? (hours_run / available_hours) * 100 : null;
      const uptime_pct = scheduled > 0 ? ((scheduled - clampedDowntime) / scheduled) * 100 : null;

      trend.push({
        date,
        scheduled_hours: Number(scheduled.toFixed(1)),
        available_hours: Number(available_hours.toFixed(1)),
        hours_run: Number(hours_run.toFixed(1)),
        downtime_hours: Number(clampedDowntime.toFixed(1)),
        breakdown_count,
        availability: availability === null ? null : Number(availability.toFixed(1)),
        utilization: utilization === null ? null : Number(utilization.toFixed(1)),
        uptime_pct: uptime_pct === null ? null : Number(uptime_pct.toFixed(1))
      });
    }

    res.json({
      end_date: formatDate(endDateObj),
      days,
      trend
    });
  } catch (err) {
    console.error("Weekly trend error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   DATA QUALITY CHECKS
========================= */
router.get("/kpi/data-quality", (req, res) => {
  try {
    const date = String(req.query.date || "").trim();
    if (!date) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }

    const assets = db.prepare(`
      SELECT id, asset_code, asset_name
      FROM assets
      WHERE active = 1 AND archived = 0
      ORDER BY asset_code
    `).all();

    const anomalies = [];
    const getDailyHours = db.prepare(`
      SELECT scheduled_hours, hours_run
      FROM daily_hours
      WHERE asset_id = ? AND work_date = ?
    `);
    const getDailyDowntime = db.prepare(`
      SELECT COALESCE(SUM(l.hours_down), 0) AS total
      FROM breakdown_downtime_logs l
      JOIN breakdowns b ON b.id = l.breakdown_id
      WHERE b.asset_id = ?
        AND l.log_date = ?
    `);

    for (const asset of assets) {
      const dh = getDailyHours.get(asset.id, date);
      const scheduled = Number(dh?.scheduled_hours || 0);
      const run = Number(dh?.hours_run || 0);
      const downtime = Number(getDailyDowntime.get(asset.id, date)?.total || 0);

      if (!dh && (run > 0 || downtime > 0)) {
        anomalies.push({
          severity: "high",
          code: "MISSING_DAILY_HOURS_ROW",
          asset_id: asset.id,
          asset_code: asset.asset_code,
          asset_name: asset.asset_name,
          detail: "Missing daily_hours row but activity is present."
        });
      }

      if (scheduled <= 0 && run > 0) {
        anomalies.push({
          severity: "high",
          code: "RUN_WITH_ZERO_SCHEDULED",
          asset_id: asset.id,
          asset_code: asset.asset_code,
          asset_name: asset.asset_name,
          detail: `Hours run (${run.toFixed(1)}) with scheduled hours at 0.`
        });
      }

      if (scheduled > 0 && downtime > scheduled) {
        anomalies.push({
          severity: "high",
          code: "DOWNTIME_EXCEEDS_SCHEDULED",
          asset_id: asset.id,
          asset_code: asset.asset_code,
          asset_name: asset.asset_name,
          detail: `Downtime (${downtime.toFixed(1)}) exceeds scheduled (${scheduled.toFixed(1)}).`
        });
      }

      if (run > scheduled && scheduled > 0) {
        anomalies.push({
          severity: "medium",
          code: "RUN_EXCEEDS_SCHEDULED",
          asset_id: asset.id,
          asset_code: asset.asset_code,
          asset_name: asset.asset_name,
          detail: `Hours run (${run.toFixed(1)}) exceeds scheduled (${scheduled.toFixed(1)}).`
        });
      }

      if (scheduled > 0 && run === 0 && downtime === 0) {
        anomalies.push({
          severity: "low",
          code: "NO_ACTIVITY_WITH_SCHEDULED",
          asset_id: asset.id,
          asset_code: asset.asset_code,
          asset_name: asset.asset_name,
          detail: "Scheduled hours exist but no run/downtime captured."
        });
      }
    }

    const summary = {
      total_assets: assets.length,
      issues_total: anomalies.length,
      high: anomalies.filter((a) => a.severity === "high").length,
      medium: anomalies.filter((a) => a.severity === "medium").length,
      low: anomalies.filter((a) => a.severity === "low").length
    };

    res.json({
      date,
      summary,
      anomalies
    });
  } catch (err) {
    console.error("Data quality error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   OPERATIONS SUMMARY
========================= */
router.get("/operations/summary", (req, res) => {
  try {
    const date = String(req.query.date || "").trim();
    if (!date) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }

    const tableExists = db.prepare(`
      SELECT COUNT(*) AS c
      FROM sqlite_master
      WHERE type = 'table' AND name = 'operations_logs'
    `).get();

    if (!Number(tableExists?.c || 0)) {
      return res.json({
        ok: true,
        date,
        totals: {
          tonnes_moved: 0,
          product_produced: 0,
          amount_produced: 0,
          total_truck_loads: 0
        },
        product_client_breakdown: [],
        warning: "operations_logs table not found"
      });
    }

    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(tonnes_moved), 0) AS tonnes_moved,
        COALESCE(SUM(product_produced), 0) AS product_produced,
        COALESCE(SUM(weighbridge_amount), 0) AS amount_produced,
        COALESCE(SUM(trucks_loaded), 0) AS total_truck_loads
      FROM operations_logs
      WHERE op_date = ?
    `).get(date);

    const breakdown = db.prepare(`
      SELECT
        COALESCE(NULLIF(TRIM(product_type), ''), 'Unknown Product') AS product_type,
        COALESCE(NULLIF(TRIM(client_delivered_to), ''), 'Unspecified Client') AS client_name,
        COALESCE(SUM(trucks_delivered), 0) AS truck_loads,
        COALESCE(SUM(product_delivered), 0) AS product_delivered,
        COALESCE(SUM(weighbridge_amount), 0) AS amount_produced
      FROM operations_logs
      WHERE op_date = ?
      GROUP BY
        COALESCE(NULLIF(TRIM(product_type), ''), 'Unknown Product'),
        COALESCE(NULLIF(TRIM(client_delivered_to), ''), 'Unspecified Client')
      ORDER BY truck_loads DESC, product_delivered DESC
      LIMIT 200
    `).all(date).map((r) => ({
      product_type: r.product_type,
      client_name: r.client_name,
      truck_loads: Number(r.truck_loads || 0),
      product_delivered: Number(Number(r.product_delivered || 0).toFixed(2)),
      amount_produced: Number(Number(r.amount_produced || 0).toFixed(2))
    }));

    return res.json({
      ok: true,
      date,
      totals: {
        tonnes_moved: Number(Number(totals?.tonnes_moved || 0).toFixed(2)),
        product_produced: Number(Number(totals?.product_produced || 0).toFixed(2)),
        amount_produced: Number(Number(totals?.amount_produced || 0).toFixed(2)),
        total_truck_loads: Number(totals?.total_truck_loads || 0)
      },
      product_client_breakdown: breakdown
    });
  } catch (err) {
    console.error("Operations summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   SERVICE REMINDERS
   Flexible schema handling so we do not explode
   if maintenance_plans field names differ a bit.
========================= */
router.get("/service/reminders", (req, res) => {
  try {
    const tables = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
    `).all().map(r => r.name);

    if (!tables.includes("maintenance_plans")) {
      return res.json({
        reminders: [],
        warning: "maintenance_plans table not found"
      });
    }

    if (!tables.includes("asset_hours")) {
      return res.json({
        reminders: [],
        warning: "asset_hours table not found"
      });
    }

    const planCols = db.prepare(`PRAGMA table_info(maintenance_plans)`).all();
    const planColNames = planCols.map(c => c.name);

    const hasActive = planColNames.includes("active");
    const hasArchived = planColNames.includes("archived");

    const whereParts = [];
    if (hasActive) whereParts.push("COALESCE(mp.active, 1) = 1");
    if (hasArchived) whereParts.push("COALESCE(mp.archived, 0) = 0");

    const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

    const rows = db.prepare(`
      SELECT
        mp.*,
        a.asset_code,
        a.asset_name,
        ah.total_hours AS current_hours
      FROM maintenance_plans mp
      LEFT JOIN assets a ON a.id = mp.asset_id
      LEFT JOIN asset_hours ah ON ah.asset_id = mp.asset_id
      ${whereClause}
      ORDER BY a.asset_code, mp.id
    `).all();

    const reminders = rows.map((row) => {
      const interval_hours = toNumber(pickField(row, [
        "interval_hours",
        "service_interval_hours",
        "interval",
        "frequency_hours",
        "due_every_hours"
      ], 0));

      const current_hours = toNumber(pickField(row, [
        "current_hours"
      ], 0));

      const last_service_hours = toNumber(pickField(row, [
        "last_service_hours",
        "last_done_hours",
        "completed_at_hours",
        "baseline_hours",
        "start_hours"
      ], 0));

      let due_at_hours = pickField(row, [
        "next_due_hours",
        "due_at_hours",
        "service_due_hours",
        "target_hours"
      ], null);

      due_at_hours = due_at_hours === null
        ? null
        : toNumber(due_at_hours, 0);

      if (due_at_hours === null && interval_hours > 0) {
        due_at_hours = last_service_hours > 0
          ? last_service_hours + interval_hours
          : interval_hours;
      }

      const hours_remaining = due_at_hours === null
        ? null
        : Number((due_at_hours - current_hours).toFixed(1));

      const reminderMeta = hours_remaining === null
        ? { status: "UNKNOWN", sort_rank: 99 }
        : getReminderStatus(hours_remaining, interval_hours);

      return {
        plan_id: row.id,
        asset_id: row.asset_id ?? null,
        asset_code: row.asset_code || row.asset_code_text || "Unknown",
        asset_name: row.asset_name || "Unknown Asset",
        service_name: pickField(row, [
          "service_name",
          "plan_name",
          "maintenance_type",
          "service_type",
          "description",
          "name"
        ], "Planned Service"),
        interval_hours: Number(interval_hours.toFixed(1)),
        current_hours: Number(current_hours.toFixed(1)),
        last_service_hours: Number(last_service_hours.toFixed(1)),
        due_at_hours: due_at_hours === null ? null : Number(due_at_hours.toFixed(1)),
        hours_remaining,
        status: reminderMeta.status,
        sort_rank: reminderMeta.sort_rank
      };
    })
    .filter(row => row.due_at_hours !== null || row.interval_hours > 0)
    .sort((a, b) => {
      if (a.sort_rank !== b.sort_rank) return a.sort_rank - b.sort_rank;
      return (a.hours_remaining ?? 999999) - (b.hours_remaining ?? 999999);
    });

    res.json({ reminders });
  } catch (err) {
    console.error("Service reminders error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;