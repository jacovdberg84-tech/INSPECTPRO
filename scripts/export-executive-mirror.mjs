import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const defaultConfig = {
  api_base: "http://localhost:3002/api/dashboard",
  blob_container: "mirror-inbound",
  spool_dir: "C:/INSPECTPRO/cloud/spool",
  archive_dir: "C:/INSPECTPRO/cloud/archive",
  lookback_days: 7,
  date: new Date().toISOString().slice(0, 10),
  azure_storage_account: "",
  azure_storage_key: "",
  upload_mode: "az-cli"
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const value = args[i + 1];
    if (key?.startsWith("--")) {
      out[key.slice(2)] = value;
      i += 1;
    }
  }
  return out;
}

async function readConfig(configPath) {
  if (!configPath) return defaultConfig;
  const text = await fs.readFile(configPath, "utf8");
  const fromFile = JSON.parse(text);
  return { ...defaultConfig, ...fromFile };
}

async function fetchJson(url) {
  const res = await fetch(url);
  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status}: ${url} :: ${txt}`);
  }
  return JSON.parse(txt);
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
      shell: false
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += String(d); });
    child.stderr.on("data", (d) => { stderr += String(d); });

    child.on("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
    });
    child.on("error", reject);
  });
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function uploadWithAzCli(filePath, fileName, cfg) {
  const args = [
    "storage", "blob", "upload",
    "--overwrite", "true",
    "--container-name", cfg.blob_container,
    "--name", fileName,
    "--file", filePath,
    "--account-name", cfg.azure_storage_account
  ];
  const env = {};
  if (cfg.azure_storage_key) {
    env.AZURE_STORAGE_KEY = cfg.azure_storage_key;
  }
  await run("az", args, env);
}

async function main() {
  const args = parseArgs();
  const configPath = args.config || "";
  const cfg = await readConfig(configPath);
  cfg.date = args.date || cfg.date;

  await ensureDir(cfg.spool_dir);
  await ensureDir(cfg.archive_dir);

  const date = cfg.date;
  const host = os.hostname();
  const batchId = `${new Date().toISOString()}-${host}`;

  const [kpiDaily, weeklyTrend, serviceReminders, dataQuality, operationsSummary, alertCenter] = await Promise.all([
    fetchJson(`${cfg.api_base}/kpi/daily?date=${encodeURIComponent(date)}`),
    fetchJson(`${cfg.api_base}/kpi/weekly-trend?end_date=${encodeURIComponent(date)}&days=${Number(cfg.lookback_days || 7)}`),
    fetchJson(`${cfg.api_base}/service/reminders`),
    fetchJson(`${cfg.api_base}/kpi/data-quality?date=${encodeURIComponent(date)}`),
    fetchJson(`${cfg.api_base}/operations/summary?date=${encodeURIComponent(date)}`),
    fetchJson(`${cfg.api_base}/alerts/center?date=${encodeURIComponent(date)}`)
  ]);

  const envelope = {
    contract_version: "1.0",
    batch_id: batchId,
    source_host: host,
    exported_at_utc: new Date().toISOString(),
    date,
    payload: {
      kpi_daily: kpiDaily,
      weekly_trend: weeklyTrend,
      service_reminders: serviceReminders,
      data_quality: dataQuality,
      operations_summary: operationsSummary,
      alert_center: alertCenter
    }
  };

  const json = JSON.stringify(envelope, null, 2);
  const digest = sha256(json);
  const fileName = `executive-mirror-${date}-${Date.now()}.json`;
  const spoolPath = path.join(cfg.spool_dir, fileName);

  await fs.writeFile(spoolPath, json, "utf8");

  try {
    if (cfg.upload_mode !== "az-cli") {
      throw new Error(`Unsupported upload_mode: ${cfg.upload_mode}`);
    }
    await uploadWithAzCli(spoolPath, fileName, cfg);

    const archivePath = path.join(cfg.archive_dir, fileName);
    await fs.rename(spoolPath, archivePath);
    console.log(`Export successful: ${fileName} sha256=${digest}`);
  } catch (err) {
    console.error(`Upload failed, file left in spool for retry: ${fileName}`);
    console.error(err.message);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
