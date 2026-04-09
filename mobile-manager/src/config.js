import Constants from "expo-constants";

/** Local LAN API (use `EXPO_PUBLIC_IRONLOG_API_BASE` in `.env` to point Metro at this). */
export const DEV_LAN_API_BASE = "http://192.168.20.127:3002/api";

/** Production IRONLOG Africa host (same as `extra.ironlogApiBase` in app.json). */
export const IRONLOG_AFRICA_API_BASE = "https://ironlog.ironlogafrica.com/api";

/**
 * Production API base: `app.json` extra.ironlogApiBase, then EAS env via app.config.js,
 * then `EXPO_PUBLIC_IRONLOG_API_BASE`, then IRONLOG_AFRICA_API_BASE.
 */
function readIronlogApiBaseFromBuild() {
  const extra = Constants.expoConfig?.extra || {};
  const fromExtra = String(extra.ironlogApiBase || "").trim();
  if (fromExtra) return fromExtra;
  const fromPublic = String(
    typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_IRONLOG_API_BASE || "" : ""
  ).trim();
  return fromPublic;
}

export const API_BASE_URL =
  readIronlogApiBaseFromBuild() || IRONLOG_AFRICA_API_BASE;

export const CHECKLIST_ITEMS = [
  { key: "engine", label: "Engine" },
  { key: "hydraulics", label: "Hydraulics" },
  { key: "leaks", label: "Leaks" },
  { key: "lights", label: "Lights" },
  { key: "brakes", label: "Brakes" },
  { key: "safety_equipment", label: "Safety Equipment" },
  { key: "tyres", label: "Tyres" },
  { key: "fluids", label: "Fluids" }
];

export const DEFAULT_CHECKLIST = Object.fromEntries(
  CHECKLIST_ITEMS.map((item) => [item.key, "ok"])
);
