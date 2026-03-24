import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

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

async function main() {
  const configPath = process.argv[3];
  if (process.argv[2] !== "--config" || !configPath) {
    throw new Error("Usage: node retry-executive-spool.mjs --config <path>");
  }
  const cfg = JSON.parse(await fs.readFile(configPath, "utf8"));
  const spoolDir = cfg.spool_dir || "C:/INSPECTPRO/cloud/spool";
  const archiveDir = cfg.archive_dir || "C:/INSPECTPRO/cloud/archive";
  const files = (await fs.readdir(spoolDir)).filter((f) => f.endsWith(".json")).sort();
  const env = cfg.azure_storage_key ? { AZURE_STORAGE_KEY: cfg.azure_storage_key } : {};

  for (const file of files) {
    const fullPath = path.join(spoolDir, file);
    try {
      await run("az", [
        "storage", "blob", "upload",
        "--overwrite", "true",
        "--container-name", cfg.blob_container || "mirror-inbound",
        "--name", file,
        "--file", fullPath,
        "--account-name", cfg.azure_storage_account
      ], env);
      await fs.rename(fullPath, path.join(archiveDir, file));
      console.log(`Replay success: ${file}`);
    } catch (err) {
      console.error(`Replay failed: ${file} :: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
