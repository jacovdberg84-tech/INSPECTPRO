import { Router } from "express";
import { db } from "../db/client.js";

const router = Router();

const VALID_STATUSES = ["ok", "attention", "unsafe"];
const CHECKLIST_ITEMS = [
  "engine",
  "hydraulics",
  "leaks",
  "undercarriage",
  "attachment",
  "lights",
  "battery",
  "reverse_alarm",
  "horn",
  "brakes",
  "seat_belt",
  "fire_extinguisher",
  "mirrors",
  "safety_equipment",
  "tyres",
  "fluids",
  "other"
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

function parseHourMeterReading(value) {
  if (value === null || value === undefined || value === "") return null;

  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("hour_meter_reading must be a valid positive number");
  }

  return num;
}
function readFilesAsDataUrls(fileList) {
  const files = Array.from(fileList || []);
  return Promise.all(
    files.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsDataURL(file);
    }))
  );
}

function parseLubeQty(value) {
  if (value === null || value === undefined || value === "") return null;

  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("lube_qty must be a valid positive number");
  }

  return num;
}

/* -----------------------------
   ARTISAN DAILY INSPECTIONS
----------------------------- */
router.post("/inspections", (req, res) => {
  try {
    const body = req.body || {};

    const asset_id = Number(body.asset_id);
    if (!Number.isInteger(asset_id) || asset_id <= 0) {
      return res.status(400).json({ error: "asset_id must be a positive integer" });
    }

    const artisan_name = String(body.artisan_name || "").trim();
    if (!artisan_name) {
      return res.status(400).json({ error: "artisan_name is required" });
    }

    const artisan_signature = String(body.artisan_signature || "").trim();
    if (!artisan_signature) {
      return res.status(400).json({ error: "artisan_signature is required" });
    }

    const other_comment = body.other_comment ? String(body.other_comment).trim() : null;
    const lube_type = body.lube_type ? String(body.lube_type).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    let lube_qty = null;
    try {
      lube_qty = parseLubeQty(body.lube_qty);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    let hour_meter_reading = null;
    try {
      hour_meter_reading = parseHourMeterReading(body.hour_meter_reading);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const checklist = normalizeChecklist(body.checklist);
    const checklist_json = JSON.stringify(checklist);

    const asset = db.prepare(`
      SELECT id, asset_code, asset_name
      FROM assets
      WHERE id = ?
    `).get(asset_id);

    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }

    db.prepare(`
      INSERT INTO artisan_inspections (
        asset_id,
        artisan_name,
        artisan_signature,
        inspection_date,
        checklist_json,
        other_comment,
        lube_type,
        lube_qty,
        notes,
        hour_meter_reading
      )
      VALUES (?, ?, ?, DATE('now'), ?, ?, ?, ?, ?, ?)
    `).run(
      asset_id,
      artisan_name,
      artisan_signature,
      checklist_json,
      other_comment,
      lube_type,
      lube_qty,
      notes,
      hour_meter_reading
    );

    res.json({
      ok: true,
      asset_id,
      asset_code: asset.asset_code,
      asset_name: asset.asset_name,
      artisan_name,
      inspection_date: new Date().toISOString().slice(0, 10)
    });
  } catch (err) {
    console.error("Create artisan inspection error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/inspections", (req, res) => {
  try {
    const artisan = String(req.query.artisan || "").trim();

    let rows;
    if (artisan) {
      rows = db.prepare(`
        SELECT
          ai.id,
          ai.asset_id,
          a.asset_code,
          a.asset_name,
          ai.artisan_name,
          ai.inspection_date,
          ai.other_comment,
          ai.lube_type,
          ai.lube_qty,
          ai.notes,
          ai.hour_meter_reading
        FROM artisan_inspections ai
        LEFT JOIN assets a ON a.id = ai.asset_id
        WHERE lower(ai.artisan_name) = lower(?)
        ORDER BY ai.id DESC
        LIMIT 50
      `).all(artisan);
    } else {
      rows = db.prepare(`
        SELECT
          ai.id,
          ai.asset_id,
          a.asset_code,
          a.asset_name,
          ai.artisan_name,
          ai.inspection_date,
          ai.other_comment,
          ai.lube_type,
          ai.lube_qty,
          ai.notes,
          ai.hour_meter_reading
        FROM artisan_inspections ai
        LEFT JOIN assets a ON a.id = ai.asset_id
        ORDER BY ai.id DESC
        LIMIT 50
      `).all();
    }

    res.json(rows);
  } catch (err) {
    console.error("List artisan inspections error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* -----------------------------
   ARTISAN WORK ORDERS
----------------------------- */
router.get("/workorders", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        wo.id,
        wo.asset_id,
        wo.source,
        wo.reference_id,
        wo.status,
        wo.opened_at,
        wo.closed_at,
        a.asset_code,
        a.asset_name,
        b.description AS breakdown_description,
        b.component AS breakdown_component
      FROM work_orders wo
      LEFT JOIN assets a ON a.id = wo.asset_id
      LEFT JOIN breakdowns b
        ON wo.source = 'breakdown'
       AND b.id = wo.reference_id
      WHERE wo.status IN ('open', 'in_progress', 'assigned')
      ORDER BY wo.id DESC
      LIMIT 100
    `).all();

    const result = rows.map((row) => {
      const description = String(row.breakdown_description || "");
      const issueMatch = description.match(/Issue:\s*(.*)/i);
      const timeDownMatch = description.match(/Time Down:\s*(.*)/i);

      return {
        ...row,
        issue: issueMatch ? issueMatch[1] : "",
        time_down: timeDownMatch ? timeDownMatch[1] : ""
      };
    });

    res.json(result);
  } catch (err) {
    console.error("List artisan work orders error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/workorders/:id/complete", (req, res) => {
  try {
    const workOrderId = Number(req.params.id);
    if (!Number.isInteger(workOrderId) || workOrderId <= 0) {
      return res.status(400).json({ error: "Invalid work order id" });
    }

    const artisan_name = String(req.body?.artisan_name || "").trim();
const artisan_signature = String(req.body?.artisan_signature || "").trim();
const work_done_notes = String(req.body?.work_done_notes || "").trim();
const before_photos = Array.isArray(req.body?.before_photos) ? req.body.before_photos : [];
const after_photos = Array.isArray(req.body?.after_photos) ? req.body.after_photos : [];

    if (!artisan_name) {
      return res.status(400).json({ error: "artisan_name is required" });
    }

    if (!artisan_signature) {
      return res.status(400).json({ error: "artisan_signature is required" });
    }

    if (!work_done_notes) {
      return res.status(400).json({ error: "work_done_notes is required" });
    }

    const wo = db.prepare(`
      SELECT id, asset_id, source, reference_id, status
      FROM work_orders
      WHERE id = ?
    `).get(workOrderId);

    if (!wo) {
      return res.status(404).json({ error: "Work order not found" });
    }

    const completionNote = [
      `WORK ORDER COMPLETED BY ARTISAN`,
      `Artisan: ${artisan_name}`,
      `Signature: ${artisan_signature}`,
      `Completed At: ${new Date().toISOString()}`,
      `Work Done: ${work_done_notes}`
    ].join("\n");

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE work_orders
        SET status = 'completed_by_artisan'
        WHERE id = ?
      `).run(workOrderId);

      if (wo.source === "breakdown" && wo.reference_id) {
        db.prepare(`
          UPDATE breakdowns
          SET description = CASE
            WHEN description IS NULL OR TRIM(description) = '' THEN ?
            ELSE description || char(10) || char(10) || ?
          END,
          status = CASE
            WHEN status = 'OPEN' THEN 'READY_FOR_CLOSE'
            ELSE status
          END
          WHERE id = ?
        `).run(completionNote, completionNote, wo.reference_id);
      }
    });

    tx();

    res.json({
  ok: true,
  work_order_id: workOrderId,
  status: "completed_by_artisan",
  uploaded_before_count: before_photos.length,
  uploaded_after_count: after_photos.length
});
  } catch (err) {
    console.error("Complete artisan work order error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;