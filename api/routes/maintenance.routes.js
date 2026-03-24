import { Router } from "express";
import { db } from "../db/client.js";

const router = Router();

function toNumber(val, field) {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${field} must be a valid positive number`);
  }
  return num;
}

router.post("/", (req, res) => {
  try {
    const {
      asset_id,
      artisan_name,
      artisan_signature,
      maintenance_type,
      service_type,
      hour_meter_reading,
      notes,
      lubes = [],
      parts = [],
      changes = []
    } = req.body || {};

    if (!asset_id) return res.status(400).json({ error: "asset_id required" });
    if (!artisan_name) return res.status(400).json({ error: "artisan_name required" });
    if (!artisan_signature) return res.status(400).json({ error: "artisan_signature required" });
    if (!maintenance_type) return res.status(400).json({ error: "maintenance_type required" });

    const hours = toNumber(hour_meter_reading, "hour_meter_reading");

    const tx = db.transaction(() => {
      const record = db.prepare(`
        INSERT INTO maintenance_records (
          asset_id,
          artisan_name,
          artisan_signature,
          maintenance_date,
          maintenance_type,
          service_type,
          hour_meter_reading,
          notes
        )
        VALUES (?, ?, ?, DATE('now'), ?, ?, ?, ?)
      `).run(
        asset_id,
        artisan_name,
        artisan_signature,
        maintenance_type,
        service_type || null,
        hours,
        notes || null
      );

      const recordId = record.lastInsertRowid;

      // LUBES
      const lubeStmt = db.prepare(`
        INSERT INTO maintenance_lubes (maintenance_record_id, lube_type, quantity)
        VALUES (?, ?, ?)
      `);

      for (const l of lubes) {
        lubeStmt.run(
          recordId,
          l.type || null,
          toNumber(l.qty, "lube qty")
        );
      }

      // PARTS
      const partStmt = db.prepare(`
        INSERT INTO maintenance_parts (maintenance_record_id, part_name, quantity)
        VALUES (?, ?, ?)
      `);

      for (const p of parts) {
        partStmt.run(
          recordId,
          p.name || null,
          toNumber(p.qty, "part qty")
        );
      }

      // CHANGES
      const changeStmt = db.prepare(`
        INSERT INTO maintenance_changes (maintenance_record_id, change_type, description, quantity)
        VALUES (?, ?, ?, ?)
      `);

      for (const c of changes) {
        changeStmt.run(
          recordId,
          c.type || null,
          c.description || null,
          toNumber(c.qty, "change qty")
        );
      }

      return recordId;
    });

    const id = tx();

    res.json({
      ok: true,
      maintenance_record_id: id
    });

  } catch (err) {
    console.error("Maintenance error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;