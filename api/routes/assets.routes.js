import { Router } from "express";
import { db } from "../db/client.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const router = Router();
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
// ---------------------------
// GET /api/assets (all assets)
// ---------------------------
router.get("/", (req, res) => {
  try {
    const assets = db.prepare(`
      SELECT id, asset_code, asset_name
      FROM assets
      ORDER BY asset_code ASC
    `).all();
    res.json(assets);
  } catch (err) {
    console.error("Assets query error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// GET /api/assets/my?operator=NAME
// ---------------------------
router.get("/my", (req, res) => {
  try {
    const operator = String(req.query.operator || "").trim();
    if (!operator) {
      return res.status(400).json({ error: "operator query parameter is required" });
    }

    const assets = db.prepare(`
      SELECT a.id, a.asset_code, a.asset_name
      FROM asset_allocations aa
      JOIN assets a ON a.id = aa.asset_id
      WHERE LOWER(aa.operator_name) = LOWER(?)
        AND aa.active = 1
      ORDER BY a.asset_code ASC
    `).all(operator);

    if (assets.length === 0) {
      return res.status(404).json({ 
        error: "No active allocations found",
        operator: operator,
        hint: "Check operator name spelling or contact admin for allocation"
      });
    }

    res.json(assets);
  } catch (err) {
    console.error("My assets query error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/hours", (req, res) => {
  try {
    const assetId = Number(req.params.id);

    if (!Number.isInteger(assetId) || assetId <= 0) {
      return res.status(400).json({ error: "Invalid asset id" });
    }

    const row = db.prepare(`
      SELECT total_hours
      FROM asset_hours
      WHERE asset_id = ?
    `).get(assetId);

    res.json({
      asset_id: assetId,
      total_hours: row ? Number(row.total_hours || 0) : 0
    });
  } catch (err) {
    console.error("Get asset hours error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;