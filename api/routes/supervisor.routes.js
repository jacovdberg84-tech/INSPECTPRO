import { Router } from "express";
import { db } from "../db/client.js";

const router = Router();

/* --------------------------------
   LIST WORK ORDERS AWAITING APPROVAL
--------------------------------- */
router.get("/approvals", (req, res) => {
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
        wo.supervisor_name,
        wo.supervisor_decision_at,
        wo.supervisor_notes,
        a.asset_code,
        a.asset_name,
        b.status AS breakdown_status,
        b.component AS breakdown_component,
        b.description AS breakdown_description
      FROM work_orders wo
      LEFT JOIN assets a ON a.id = wo.asset_id
      LEFT JOIN breakdowns b
        ON wo.source = 'breakdown'
       AND b.id = wo.reference_id
      WHERE wo.status = 'completed_by_artisan'
      ORDER BY wo.id DESC
      LIMIT 100
    `).all();

    const result = rows.map((row) => {
      const description = String(row.breakdown_description || "");
      const issueMatch = description.match(/Issue:\s*(.*)/i);
      const timeDownMatch = description.match(/Time Down:\s*(.*)/i);
      const artisanMatch = description.match(/Artisan:\s*(.*)/i);
      const workDoneMatch = description.match(/Work Done:\s*(.*)/i);

      return {
        ...row,
        issue: issueMatch ? issueMatch[1] : "",
        time_down: timeDownMatch ? timeDownMatch[1] : "",
        artisan_name: artisanMatch ? artisanMatch[1] : "",
        work_done: workDoneMatch ? workDoneMatch[1] : ""
      };
    });

    res.json(result);
  } catch (err) {
    console.error("List supervisor approvals error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* --------------------------------
   APPROVE WORK ORDER
--------------------------------- */
router.post("/approvals/:id/approve", (req, res) => {
  try {
    const workOrderId = Number(req.params.id);
    if (!Number.isInteger(workOrderId) || workOrderId <= 0) {
      return res.status(400).json({ error: "Invalid work order id" });
    }

    const supervisor_name = String(req.body?.supervisor_name || "").trim();
    const supervisor_notes = String(req.body?.supervisor_notes || "").trim();

    if (!supervisor_name) {
      return res.status(400).json({ error: "supervisor_name is required" });
    }

    const wo = db.prepare(`
      SELECT id, source, reference_id, status
      FROM work_orders
      WHERE id = ?
    `).get(workOrderId);

    if (!wo) {
      return res.status(404).json({ error: "Work order not found" });
    }

    if (wo.status !== "completed_by_artisan") {
      return res.status(400).json({ error: "Work order is not awaiting supervisor approval" });
    }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE work_orders
        SET
          status = 'closed',
          closed_at = datetime('now'),
          supervisor_name = ?,
          supervisor_decision_at = datetime('now'),
          supervisor_notes = ?
        WHERE id = ?
      `).run(supervisor_name, supervisor_notes || null, workOrderId);

      if (wo.source === "breakdown" && wo.reference_id) {
        db.prepare(`
          UPDATE breakdowns
          SET
            status = 'CLOSED',
            end_at = datetime('now'),
            description = CASE
              WHEN ? IS NOT NULL AND TRIM(?) <> '' THEN
                COALESCE(description, '') || char(10) || char(10) ||
                'SUPERVISOR APPROVAL' || char(10) ||
                'Supervisor: ' || ? || char(10) ||
                'Approved At: ' || datetime('now') || char(10) ||
                'Notes: ' || ?
              ELSE
                COALESCE(description, '') || char(10) || char(10) ||
                'SUPERVISOR APPROVAL' || char(10) ||
                'Supervisor: ' || ? || char(10) ||
                'Approved At: ' || datetime('now')
            END
          WHERE id = ?
        `).run(
          supervisor_notes,
          supervisor_notes,
          supervisor_name,
          supervisor_notes,
          supervisor_name,
          wo.reference_id
        );
      }
    });

    tx();

    res.json({
      ok: true,
      work_order_id: workOrderId,
      status: "closed"
    });
  } catch (err) {
    console.error("Approve supervisor work order error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* --------------------------------
   REJECT WORK ORDER
--------------------------------- */
router.post("/approvals/:id/reject", (req, res) => {
  try {
    const workOrderId = Number(req.params.id);
    if (!Number.isInteger(workOrderId) || workOrderId <= 0) {
      return res.status(400).json({ error: "Invalid work order id" });
    }

    const supervisor_name = String(req.body?.supervisor_name || "").trim();
    const supervisor_notes = String(req.body?.supervisor_notes || "").trim();

    if (!supervisor_name) {
      return res.status(400).json({ error: "supervisor_name is required" });
    }

    if (!supervisor_notes) {
      return res.status(400).json({ error: "supervisor_notes are required when rejecting" });
    }

    const wo = db.prepare(`
      SELECT id, source, reference_id, status
      FROM work_orders
      WHERE id = ?
    `).get(workOrderId);

    if (!wo) {
      return res.status(404).json({ error: "Work order not found" });
    }

    if (wo.status !== "completed_by_artisan") {
      return res.status(400).json({ error: "Work order is not awaiting supervisor approval" });
    }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE work_orders
        SET
          status = 'in_progress',
          supervisor_name = ?,
          supervisor_decision_at = datetime('now'),
          supervisor_notes = ?
        WHERE id = ?
      `).run(supervisor_name, supervisor_notes, workOrderId);

      if (wo.source === "breakdown" && wo.reference_id) {
        db.prepare(`
          UPDATE breakdowns
          SET
            status = 'OPEN',
            description = COALESCE(description, '') || char(10) || char(10) ||
              'SUPERVISOR REJECTION' || char(10) ||
              'Supervisor: ' || ? || char(10) ||
              'Rejected At: ' || datetime('now') || char(10) ||
              'Notes: ' || ?
          WHERE id = ?
        `).run(supervisor_name, supervisor_notes, wo.reference_id);
      }
    });

    tx();

    res.json({
      ok: true,
      work_order_id: workOrderId,
      status: "in_progress"
    });
  } catch (err) {
    console.error("Reject supervisor work order error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;