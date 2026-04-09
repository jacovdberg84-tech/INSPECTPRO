import { API_BASE_URL } from "./config";

let runtimeApiBase = API_BASE_URL;

function normalizeApiBase(input) {
  let value = String(input || "").trim();
  if (!value) return API_BASE_URL;
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  value = value.replace(/\/+$/, "");
  if (!/\/api$/i.test(value)) value = `${value}/api`;
  return value;
}

export function setApiBaseUrl(input) {
  runtimeApiBase = normalizeApiBase(input);
  return runtimeApiBase;
}

export function getApiBaseUrl() {
  return runtimeApiBase;
}

export async function fetchAssets() {
  const res = await fetch(`${runtimeApiBase}/assets`);
  if (!res.ok) throw new Error(`Failed to load assets (${res.status})`);
  return res.json();
}

export async function fetchAssetHours(assetId) {
  const res = await fetch(`${runtimeApiBase}/assets/${assetId}/hours`);
  if (!res.ok) throw new Error(`Failed to load hours (${res.status})`);
  return res.json();
}

export async function submitManagerInspection(payload) {
  const res = await fetch(`${runtimeApiBase}/manager/inspections`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(data?.error || `Failed to submit (${res.status})`);
  }

  return data;
}

export async function fetchManagerAudit(limit = 20) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));
  const res = await fetch(`${runtimeApiBase}/manager/audit/recent?limit=${safeLimit}`);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(data?.error || `Failed to load audit (${res.status})`);
  }
  return data;
}

export async function submitManagerDamageReport(payload) {
  const res = await fetch(`${runtimeApiBase}/manager/damages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(data?.error || `Failed to submit damage report (${res.status})`);
  }
  return data;
}

export async function pingServerHealth() {
  const root = runtimeApiBase.replace(/\/api$/i, "");
  const res = await fetch(`${root}/health`);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(data?.error || `Health check failed (${res.status})`);
  }
  return data;
}

