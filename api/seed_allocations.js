import { db } from "./db/client.js";

// Pick 3 machines by asset_code and allocate to an operator name.
// Change these to real asset codes from your IRONLOG assets table.
const operator = "Jaco";

const assetCodes = ["A301AM", "EX120", "GEN01"]; // <-- change these

for (const code of assetCodes) {
  const a = db.prepare(`SELECT id, asset_code FROM assets WHERE asset_code = ?`).get(code);
  if (!a) {
    console.log("Asset not found:", code);
    continue;
  }

  db.prepare(`
    INSERT INTO asset_allocations (asset_id, operator_name, active)
    VALUES (?, ?, 1)
  `).run(a.id, operator);

  console.log("Allocated", a.asset_code, "to", operator);
}

console.log("Done ✅");
process.exit(0);