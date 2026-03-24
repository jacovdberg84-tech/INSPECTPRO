const today = new Date().toISOString().slice(0, 10);
const date = process.argv[2] || today;
const lanBase = process.env.LAN_DASHBOARD_API || "http://localhost:3002/api/dashboard";
const cloudBase = process.env.CLOUD_DASHBOARD_API || "https://inspectpro-prod-api.azurewebsites.net/api/dashboard";

async function j(url, headers = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url} :: ${text}`);
  return JSON.parse(text);
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function diffPct(a, b) {
  const av = toNum(a);
  const bv = toNum(b);
  if (av === 0 && bv === 0) return 0;
  return Math.abs(av - bv) / Math.max(Math.abs(av), Math.abs(bv), 1) * 100;
}

async function main() {
  const cloudHeaders = {
    "x-exec-role": process.env.CLOUD_EXEC_ROLE || "ExecutiveViewer",
    "x-exec-token": process.env.CLOUD_EXEC_TOKEN || ""
  };

  const [lanKpi, cloudKpi, lanOps, cloudOps, lanAlert, cloudAlert] = await Promise.all([
    j(`${lanBase}/kpi/daily?date=${encodeURIComponent(date)}`),
    j(`${cloudBase}/kpi/daily?date=${encodeURIComponent(date)}`, cloudHeaders),
    j(`${lanBase}/operations/summary?date=${encodeURIComponent(date)}`),
    j(`${cloudBase}/operations/summary?date=${encodeURIComponent(date)}`, cloudHeaders),
    j(`${lanBase}/alerts/center?date=${encodeURIComponent(date)}`),
    j(`${cloudBase}/alerts/center?date=${encodeURIComponent(date)}`, cloudHeaders)
  ]);

  const lanByAsset = new Map((lanKpi.assets || []).map((a) => [String(a.asset_id), a]));
  const cloudByAsset = new Map((cloudKpi.assets || []).map((a) => [String(a.asset_id), a]));

  let maxDelta = 0;
  let mismatches = 0;
  for (const [assetId, row] of lanByAsset.entries()) {
    const c = cloudByAsset.get(assetId);
    if (!c) {
      mismatches += 1;
      continue;
    }
    const fields = ["scheduled_hours", "available_hours", "hours_run", "downtime_hours", "availability", "utilization", "uptime_pct"];
    for (const f of fields) {
      const d = diffPct(row[f], c[f]);
      if (d > maxDelta) maxDelta = d;
      if (d > 2) mismatches += 1;
    }
  }

  const opsDelta = diffPct(lanOps?.totals?.amount_produced, cloudOps?.totals?.amount_produced);
  const alertsDelta = Math.abs(toNum(lanAlert?.summary?.critical_total) - toNum(cloudAlert?.summary?.critical_total));
  const lagMinutes = Number(process.env.MIRROR_LAG_MINUTES || 10);

  const pass = mismatches === 0 && opsDelta <= 2 && alertsDelta <= 1;

  console.log(JSON.stringify({
    date,
    pass,
    thresholds: {
      field_delta_pct: 2,
      critical_alert_count_delta: 1,
      freshness_minutes_target: lagMinutes
    },
    stats: {
      assets_lan: (lanKpi.assets || []).length,
      assets_cloud: (cloudKpi.assets || []).length,
      max_kpi_delta_pct: Number(maxDelta.toFixed(2)),
      operations_amount_delta_pct: Number(opsDelta.toFixed(2)),
      critical_alert_count_delta: alertsDelta
    }
  }, null, 2));

  if (!pass) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
