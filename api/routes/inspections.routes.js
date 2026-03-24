import { Router } from "express";
import { db } from "../db/client.js";

const router = Router();
const STATION_COLLISION_WINDOW_MINUTES = 15;

const VALID_STATUSES = ["ok", "attention", "unsafe"];
const CHECKLIST_ITEMS = [
  "tyres",
  "lights",
  "fluids",
  "leaks",
  "hydraulics",
  "safety_equipment",
  "engine",
  "brakes",
  "horn",
  "reverse_alarm",
  "fire_extinguisher",
  "seat_belt",
  "mirrors",
  "battery",
  "undercarriage",
  "attachment",
];

function normalizeChecklist(input) {
  const raw = input && typeof input === "object" ? input : {};
  const checklist = {};

  for (const key of CHECKLIST_ITEMS) {
    const value = String(raw[key] || "ok").trim().toLowerCase();
    checklist[key] = VALID_STATUSES.includes(value) ? value : "ok";
  }

  return checklist;
}

function calculateStatus(checklist) {
  const values = Object.values(checklist);
  if (values.includes("unsafe")) return "unsafe";
  if (values.includes("attention")) return "attention";
  return "ok";
}

function derivePrimaryComponent(checklist) {
  const ordered = [
    ["engine", "Engine"],
    ["hydraulics", "Hydraulics"],
    ["leaks", "Leaks"],
    ["brakes", "Brakes"],
    ["lights", "Electrical"],
    ["battery", "Electrical"],
    ["reverse_alarm", "Electrical"],
    ["horn", "Electrical"],
    ["tyres", "Tyres"],
    ["undercarriage", "Undercarriage"],
    ["attachment", "Attachment / Tool"],
    ["safety_equipment", "Safety"],
    ["seat_belt", "Safety"],
    ["fire_extinguisher", "Safety"],
    ["mirrors", "Safety"],
    ["fluids", "Fluids"]
  ];

  for (const [key, label] of ordered) {
    if (checklist && checklist[key] && checklist[key] !== "ok") {
      return label;
    }
  }

  return "General";
}

function labelForChecklistKey(key) {
  const map = {
    tyres: "Tyres",
    lights: "Lights",
    fluids: "Fluids",
    leaks: "Leaks",
    hydraulics: "Hydraulics",
    safety_equipment: "Safety Equipment",
    engine: "Engine",
    brakes: "Brakes",
    horn: "Horn",
    reverse_alarm: "Reverse Alarm",
    fire_extinguisher: "Fire Extinguisher",
    seat_belt: "Seat Belt",
    mirrors: "Mirrors",
    battery: "Battery",
    undercarriage: "Undercarriage",
    attachment: "Attachment / Tool",
  };
  return map[key] || key;
}

function buildIssueLines(checklist) {
  return CHECKLIST_ITEMS
    .filter((key) => checklist[key] !== "ok")
    .map((key) => `- ${labelForChecklistKey(key)}: ${checklist[key].toUpperCase()}`);
}

function buildDescription({ asset, operator_name, status, notes, checklist, hour_meter_reading }) {
  const issueLines = buildIssueLines(checklist);
  const lines = [
    `PRE-START FAILURE`,
    `Machine: ${asset?.asset_code || asset?.asset_name || "Unknown Asset"}`,
    `Operator: ${operator_name}`,
    `Severity: ${status.toUpperCase()}`,
    `Timestamp: ${new Date().toISOString()}`,
  ];

  if (hour_meter_reading !== null && hour_meter_reading !== undefined) {
    lines.push(`Hour Meter: ${hour_meter_reading}`);
  }

  if (issueLines.length) {
    lines.push(``);
    lines.push(`Failed Items:`);
    lines.push(...issueLines);
  }

  if (notes) {
    lines.push(``);
    lines.push(`Operator Notes: ${notes}`);
  }

  return lines.join("\n");
}

function parseHourMeterReading(value) {
  if (value === null || value === undefined || value === "") return null;

  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("hour_meter_reading must be a valid positive number");
  }

  return num;
}

router.get("/", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        i.id,
        i.asset_id,
        a.asset_code,
        a.asset_name,
        i.operator_name,
        i.inspection_date,
        i.status,
        i.notes,
        i.checklist_json,
        i.hour_meter_reading
      FROM inspections i
      LEFT JOIN assets a ON a.id = i.asset_id
      ORDER BY i.id DESC
      LIMIT 200
    `).all();

    const result = rows.map((row) => {
      let checklist = null;
      try {
        checklist = row.checklist_json ? JSON.parse(row.checklist_json) : null;
      } catch {
        checklist = null;
      }

      return {
        ...row,
        checklist,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("List inspections error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/", (req, res) => {
  try {
    const body = req.body || {};

    const asset_id = Number(body.asset_id);
    if (!Number.isInteger(asset_id) || asset_id <= 0) {
      return res.status(400).json({ error: "asset_id must be a positive integer" });
    }

    const operator_name = String(body.operator_name || "").trim();
    if (!operator_name) {
      return res.status(400).json({ error: "operator_name is required" });
    }

    const notes = body.notes ? String(body.notes).trim() : null;

    let hour_meter_reading = null;
    try {
      hour_meter_reading = parseHourMeterReading(body.hour_meter_reading);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const checklist = normalizeChecklist(body.checklist);
    const status = calculateStatus(checklist);
    const checklist_json = JSON.stringify(checklist);
    const primaryComponent = derivePrimaryComponent(checklist);

    const asset = db.prepare(`
      SELECT id, asset_code, asset_name
      FROM assets
      WHERE id = ?
    `).get(asset_id);

    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }

    const description = buildDescription({
      asset,
      operator_name,
      status,
      notes,
      checklist,
      hour_meter_reading,
    });

    const tx = db.transaction(() => {
      let recentInspection = null;
      try {
        recentInspection = db.prepare(`
          SELECT operator_name, created_at, id
          FROM inspections
          WHERE asset_id = ?
            AND created_at IS NOT NULL
            AND datetime(created_at) >= datetime('now', ?)
          ORDER BY id DESC
          LIMIT 1
        `).get(asset_id, `-${STATION_COLLISION_WINDOW_MINUTES} minutes`);
      } catch {
        // Older DBs may not have created_at on inspections.
        recentInspection = db.prepare(`
          SELECT operator_name, inspection_date, id
          FROM inspections
          WHERE asset_id = ?
            AND inspection_date = DATE('now')
          ORDER BY id DESC
          LIMIT 1
        `).get(asset_id);
      }

      db.prepare(`
        INSERT INTO asset_hours (asset_id, total_hours, last_updated)
        SELECT ?, 0, datetime('now')
        WHERE NOT EXISTS (
          SELECT 1 FROM asset_hours WHERE asset_id = ?
        )
      `).run(asset_id, asset_id);

      const currentHoursRow = db.prepare(`
        SELECT total_hours
        FROM asset_hours
        WHERE asset_id = ?
      `).get(asset_id);

      const current_total_hours = currentHoursRow ? Number(currentHoursRow.total_hours || 0) : 0;

      let hours_updated = false;
      let hour_warning = null;

      if (hour_meter_reading !== null) {
        if (hour_meter_reading >= current_total_hours) {
          db.prepare(`
            UPDATE asset_hours
            SET total_hours = ?, last_updated = datetime('now')
            WHERE asset_id = ?
          `).run(hour_meter_reading, asset_id);

          db.prepare(`
            INSERT INTO daily_hours (
              asset_id,
              work_date,
              scheduled_hours,
              opening_hours,
              closing_hours,
              hours_run,
              is_used,
              operator,
              notes,
              created_at
            )
            SELECT ?, DATE('now'), 0, ?, ?, 0, 1, ?, ?, datetime('now')
            WHERE NOT EXISTS (
              SELECT 1
              FROM daily_hours
              WHERE asset_id = ? AND work_date = DATE('now')
            )
          `).run(
            asset_id,
            current_total_hours > 0 ? current_total_hours : hour_meter_reading,
            hour_meter_reading,
            operator_name,
            notes,
            asset_id
          );

          db.prepare(`
            UPDATE daily_hours
            SET
              closing_hours = ?,
              operator = COALESCE(NULLIF(?, ''), operator),
              notes = CASE
                WHEN ? IS NOT NULL AND TRIM(?) <> '' THEN ?
                ELSE notes
              END
            WHERE asset_id = ?
              AND work_date = DATE('now')
          `).run(
            hour_meter_reading,
            operator_name,
            notes,
            notes,
            notes,
            asset_id
          );

          db.prepare(`
            UPDATE daily_hours
            SET hours_run = CASE
              WHEN opening_hours IS NOT NULL
                   AND closing_hours IS NOT NULL
                   AND closing_hours >= opening_hours
              THEN ROUND(closing_hours - opening_hours, 2)
              ELSE hours_run
            END
            WHERE asset_id = ?
              AND work_date = DATE('now')
          `).run(asset_id);

          hours_updated = true;
        } else {
          hour_warning = `Hour reading ${hour_meter_reading} is lower than current IRONLOG hours ${current_total_hours}. IRONLOG hours were not changed.`;
        }
      }

      const ins = db.prepare(`
        INSERT INTO inspections (
          asset_id,
          operator_name,
          inspection_date,
          status,
          notes,
          checklist_json,
          hour_meter_reading
        )
        VALUES (?, ?, DATE('now'), ?, ?, ?, ?)
      `).run(
        asset_id,
        operator_name,
        status,
        notes,
        checklist_json,
        hour_meter_reading
      );

      const inspectionId = Number(ins.lastInsertRowid);

      let breakdown_id = null;
      let work_order_id = null;

      if (status !== "ok") {
        db.prepare(`
          INSERT INTO faults (asset_id, description, created_at, status, inspection_id)
          VALUES (?, ?, datetime('now'), 'open', ?)
        `).run(asset_id, description, inspectionId);

        const open = db.prepare(`
          SELECT id, primary_work_order_id
          FROM breakdowns
          WHERE asset_id = ? AND status = 'OPEN'
          ORDER BY id DESC
          LIMIT 1
        `).get(asset_id);

        if (open) {
          breakdown_id = Number(open.id);

          db.prepare(`
            UPDATE breakdowns
            SET description = CASE
              WHEN description IS NULL OR TRIM(description) = '' THEN ?
              ELSE description
            END
            WHERE id = ?
          `).run(description, breakdown_id);

          let linkedWo = null;

if (open.primary_work_order_id) {
  linkedWo = db.prepare(`
    SELECT id, status
    FROM work_orders
    WHERE id = ?
  `).get(open.primary_work_order_id);
}

const linkedWoIsActive =
  linkedWo &&
  ["open", "in_progress", "assigned"].includes(String(linkedWo.status || "").toLowerCase());

if (linkedWoIsActive) {
  work_order_id = Number(linkedWo.id);
} else {
  const wo = db.prepare(`
    INSERT INTO work_orders (asset_id, source, reference_id, status)
    VALUES (?, 'inspection', ?, 'open')
  `).run(asset_id, String(breakdown_id));

  work_order_id = Number(wo.lastInsertRowid);

  db.prepare(`
    UPDATE breakdowns
    SET primary_work_order_id = ?
    WHERE id = ?
  `).run(work_order_id, breakdown_id);
}
        } else {
          const critical = status === "unsafe" ? 1 : 0;

     const b = db.prepare(`
  INSERT INTO breakdowns (
    asset_id,
    breakdown_date,
    status,
    start_at,
    description,
    component,
    critical,
    downtime_total_hours,
    primary_work_order_id,
    get_used,
    get_hours_fitted,
    get_hours_changed
  )
  VALUES (?, DATE('now'), 'OPEN', datetime('now'), ?, ?, ?, 0, NULL, 0, NULL, NULL)
`).run(asset_id, description, primaryComponent, critical);

          breakdown_id = Number(b.lastInsertRowid);

          const wo = db.prepare(`
            INSERT INTO work_orders (asset_id, source, reference_id, status)
            VALUES (?, 'inspection', ?, 'open')
          `).run(asset_id, String(breakdown_id));

          work_order_id = Number(wo.lastInsertRowid);

          db.prepare(`
            UPDATE breakdowns
            SET primary_work_order_id = ?
            WHERE id = ?
              AND (primary_work_order_id IS NULL OR primary_work_order_id = 0)
          `).run(work_order_id, breakdown_id);
        }
      }

      const newHoursRow = db.prepare(`
        SELECT total_hours
        FROM asset_hours
        WHERE asset_id = ?
      `).get(asset_id);

      let station_collision_warning = null;
      if (
        recentInspection &&
        String(recentInspection.operator_name || "").trim().toLowerCase() !== operator_name.toLowerCase()
      ) {
        station_collision_warning =
          `Recent inspection already submitted for this asset by ${recentInspection.operator_name}. ` +
          `Please confirm this is not a duplicate station capture.`;
      }

      return {
        inspectionId,
        breakdown_id,
        work_order_id,
        status,
        checklist,
        hour_meter_reading,
        hours_updated,
        hour_warning,
        station_collision_warning,
        asset_total_hours: newHoursRow ? Number(newHoursRow.total_hours || 0) : current_total_hours,
      };
    });

    const r = tx();

    res.json({
      ok: true,
      inspection_id: r.inspectionId,
      status: r.status,
      checklist: r.checklist,
      hour_meter_reading: r.hour_meter_reading,
      hours_updated: r.hours_updated,
      hour_warning: r.hour_warning,
      station_collision_warning: r.station_collision_warning,
      asset_total_hours: r.asset_total_hours,
      created_breakdown_id: r.breakdown_id,
      created_work_order_id: r.work_order_id,
    });
  } catch (err) {
    console.error("Create inspection error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;