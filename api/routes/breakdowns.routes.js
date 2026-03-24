import { Router } from "express";
import { db } from "../db/client.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const router = Router();

function parseHourMeterReading(value) {
  if (value === null || value === undefined || value === "") return null;

  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("hour_meter_reading must be a valid positive number");
  }

  return num;
}

function isActiveWoStatus(status) {
  return ["open", "assigned", "in_progress"].includes(
    String(status || "").trim().toLowerCase()
  );
}
function extensionFromMime(mimeType) {
  const map = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
  };
  return map[String(mimeType || "").toLowerCase()] || ".jpg";
}

function saveBase64Image(dataUrl, folderName) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    throw new Error("Invalid image data");
  }

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image format");
  }

  const mimeType = match[1];
  const base64Data = match[2];
  const ext = extensionFromMime(mimeType);

  const uploadsDir = path.resolve(process.cwd(), "uploads", folderName);
  fs.mkdirSync(uploadsDir, { recursive: true });

  const fileName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const absPath = path.join(uploadsDir, fileName);
  fs.writeFileSync(absPath, Buffer.from(base64Data, "base64"));

  return {
    file_name: fileName,
    file_path: `/uploads/${folderName}/${fileName}`
  };
}

router.post("/report", (req, res) => {
  try {
    const {
  asset_id,
  operator_name,
  operator_signature,
  component,
  issue,
  notes,
  hour_meter_reading,
  breakdown_photos = []
} = req.body || {};

    const parsedAssetId = Number(asset_id);
    if (!Number.isInteger(parsedAssetId) || parsedAssetId <= 0) {
      return res.status(400).json({ error: "asset_id must be a positive integer" });
    }

    const cleanOperator = String(operator_name || "").trim();
    const cleanSignature = String(operator_signature || "").trim();
    const cleanComponent = String(component || "").trim();
    const cleanIssue = String(issue || "").trim();
    const cleanNotes = notes ? String(notes).trim() : null;

    if (!cleanOperator) {
      return res.status(400).json({ error: "operator_name is required" });
    }

    if (!cleanSignature) {
      return res.status(400).json({ error: "operator_signature is required" });
    }

    if (!cleanComponent) {
      return res.status(400).json({ error: "component is required" });
    }

    if (!cleanIssue) {
      return res.status(400).json({ error: "issue is required" });
    }

    let parsedHoursDown = null;
    try {
      parsedHoursDown = parseHourMeterReading(hour_meter_reading);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const asset = db.prepare(`
      SELECT id, asset_code, asset_name
      FROM assets
      WHERE id = ?
    `).get(parsedAssetId);

    if (!asset) {
      return res.status(404).json({ error: "Asset not found" });
    }

    const timeDown = new Date().toISOString();

    const descriptionLines = [
      `BREAKDOWN REPORT`,
      `Machine: ${asset.asset_code || asset.asset_name || parsedAssetId}`,
      `Operator: ${cleanOperator}`,
      `Signature: ${cleanSignature}`,
      `Component: ${cleanComponent}`,
      `Issue: ${cleanIssue}`,
      `Time Down: ${timeDown}`
    ];

    if (parsedHoursDown !== null) {
      descriptionLines.push(`Hours Down: ${parsedHoursDown}`);
    }

    if (cleanNotes) {
      descriptionLines.push(`Notes: ${cleanNotes}`);
    }

    const description = descriptionLines.join("\n");

    const tx = db.transaction(() => {
      // Reuse only a machine-level OPEN breakdown that still has an ACTIVE WO
      const existingOpen = db.prepare(`
        SELECT
          b.id,
          b.primary_work_order_id,
          wo.status AS wo_status
        FROM breakdowns b
        LEFT JOIN work_orders wo ON wo.id = b.primary_work_order_id
        WHERE b.asset_id = ?
          AND b.status = 'OPEN'
          AND lower(COALESCE(wo.status, '')) IN ('open', 'assigned', 'in_progress')
        ORDER BY b.id DESC
        LIMIT 1
      `).get(parsedAssetId);

      let breakdown_id;
      let work_order_id;

      if (existingOpen) {
        breakdown_id = Number(existingOpen.id);

        db.prepare(`
          UPDATE breakdowns
          SET
            description = CASE
              WHEN description IS NULL OR TRIM(description) = '' THEN ?
              ELSE description || char(10) || char(10) || ?
            END,
            component = CASE
              WHEN component IS NULL OR TRIM(component) = '' THEN ?
              ELSE component
            END
          WHERE id = ?
        `).run(description, description, cleanComponent, breakdown_id);

        db.prepare(`
          INSERT INTO breakdown_downtime_logs (
            breakdown_id,
            log_date,
            hours_down,
            notes,
            created_at,
            updated_at
          )
          VALUES (?, DATE('now'), 0, ?, datetime('now'), datetime('now'))
          ON CONFLICT (breakdown_id, log_date)
          DO UPDATE SET
            notes = excluded.notes,
            updated_at = datetime('now')
        `).run(
          breakdown_id,
          `Reported by ${cleanOperator} at ${timeDown}${parsedHoursDown !== null ? ` | Hours down: ${parsedHoursDown}` : ""}${cleanNotes ? ` | ${cleanNotes}` : ""}`
        );

        // Component-based reuse or new WO creation
        const existingComponent = db.prepare(`
          SELECT
            bc.id,
            bc.work_order_id,
            wo.status
          FROM breakdown_components bc
          LEFT JOIN work_orders wo ON wo.id = bc.work_order_id
          WHERE bc.breakdown_id = ?
            AND lower(bc.component) = lower(?)
          ORDER BY bc.id DESC
          LIMIT 1
        `).get(breakdown_id, cleanComponent);

        if (
          existingComponent &&
          existingComponent.work_order_id &&
          isActiveWoStatus(existingComponent.status)
        ) {
          work_order_id = Number(existingComponent.work_order_id);
        } else {
          const wo = db.prepare(`
            INSERT INTO work_orders (
              asset_id,
              source,
              reference_id,
              status,
              opened_at
            )
            VALUES (?, 'breakdown', ?, 'open', datetime('now'))
          `).run(parsedAssetId, breakdown_id);

          work_order_id = Number(wo.lastInsertRowid);

          db.prepare(`
            INSERT INTO breakdown_components (
              breakdown_id,
              component,
              symptom,
              work_order_id
            )
            VALUES (?, ?, ?, ?)
          `).run(breakdown_id, cleanComponent, cleanIssue, work_order_id);

          // keep backward compatibility with older screens
          db.prepare(`
            UPDATE breakdowns
            SET primary_work_order_id = ?
            WHERE id = ?
          `).run(work_order_id, breakdown_id);
        }
      } else {
        const b = db.prepare(`
          INSERT INTO breakdowns (
            asset_id,
            breakdown_date,
            status,
            start_at,
            description,
            component,
            critical,
            downtime_total_hours
          )
          VALUES (?, DATE('now'), 'OPEN', datetime('now'), ?, ?, 1, 0)
        `).run(parsedAssetId, description, cleanComponent);

        breakdown_id = Number(b.lastInsertRowid);

        db.prepare(`
          INSERT INTO breakdown_downtime_logs (
            breakdown_id,
            log_date,
            hours_down,
            notes,
            created_at,
            updated_at
          )
          VALUES (?, DATE('now'), 0, ?, datetime('now'), datetime('now'))
          ON CONFLICT (breakdown_id, log_date)
          DO UPDATE SET
            notes = excluded.notes,
            updated_at = datetime('now')
        `).run(
          breakdown_id,
          `Reported by ${cleanOperator} at ${timeDown}${parsedHoursDown !== null ? ` | Hours down: ${parsedHoursDown}` : ""}${cleanNotes ? ` | ${cleanNotes}` : ""}`
        );
        const wo = db.prepare(`
          INSERT INTO work_orders (
            asset_id,
            source,
            reference_id,
            status,
            opened_at
          )
          VALUES (?, 'breakdown', ?, 'open', datetime('now'))
        `).run(parsedAssetId, breakdown_id);

        work_order_id = Number(wo.lastInsertRowid);

        db.prepare(`
          INSERT INTO breakdown_components (
            breakdown_id,
            component,
            symptom,
            work_order_id
          )
          VALUES (?, ?, ?, ?)
        `).run(breakdown_id, cleanComponent, cleanIssue, work_order_id);

        db.prepare(`
          UPDATE breakdowns
          SET primary_work_order_id = ?
          WHERE id = ?
        `).run(work_order_id, breakdown_id);
      }
      for (const photo of breakdown_photos) {
  if (!photo) continue;

  const saved = saveBase64Image(photo, "breakdowns");

  db.prepare(`
    INSERT INTO breakdown_photos (
      breakdown_id,
      photo_stage,
      file_name,
      file_path
    )
    VALUES (?, 'reported', ?, ?)
  `).run(breakdown_id, saved.file_name, saved.file_path);
}

     return {
  breakdown_id,
  work_order_id,
  photo_count: Array.isArray(breakdown_photos) ? breakdown_photos.length : 0
};
    });

    const result = tx();

    res.json({
      ok: true,
      asset_id: asset.id,
      asset_code: asset.asset_code,
      asset_name: asset.asset_name,
      operator_name: cleanOperator,
      component: cleanComponent,
      issue: cleanIssue,
      time_down: timeDown,
      hours_down: parsedHoursDown,
      created_breakdown_id: result.breakdown_id,
      created_work_order_id: result.work_order_id,
uploaded_photo_count: result.photo_count
    });
  } catch (err) {
    console.error("Breakdown report error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/my", (req, res) => {
  try {
    const operator = String(req.query.operator || "").trim();

    if (!operator) {
      return res.status(400).json({ error: "operator query is required" });
    }

    const rows = db.prepare(`
      SELECT
        b.id,
        b.asset_id,
        a.asset_code,
        a.asset_name,
        b.breakdown_date,
        b.status,
        b.start_at,
        b.description,
        b.component,
        b.primary_work_order_id,
        w.status AS work_order_status
      FROM breakdowns b
      LEFT JOIN assets a ON a.id = b.asset_id
      LEFT JOIN work_orders w ON w.id = b.primary_work_order_id
      WHERE b.description LIKE ?
      ORDER BY b.id DESC
      LIMIT 50
    `).all(`%Operator: ${operator}%`);

    const result = rows.map((row) => {
      const issueMatch = String(row.description || "").match(/Issue:\s*(.*)/i);
      const hoursDownMatch = String(row.description || "").match(/Hours Down:\s*(.*)/i);
      const timeDownMatch = String(row.description || "").match(/Time Down:\s*(.*)/i);

      return {
        id: row.id,
        asset_id: row.asset_id,
        asset_code: row.asset_code,
        asset_name: row.asset_name,
        breakdown_date: row.breakdown_date,
        status: row.status,
        start_at: row.start_at,
        component: row.component,
        issue: issueMatch ? issueMatch[1] : "",
        hours_down: hoursDownMatch ? hoursDownMatch[1] : "",
        time_down: timeDownMatch ? timeDownMatch[1] : row.start_at,
        primary_work_order_id: row.primary_work_order_id,
        work_order_status: row.work_order_status || ""
      };
    });

    res.json(result);
  } catch (err) {
    console.error("List operator breakdowns error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;