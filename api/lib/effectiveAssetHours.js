/**
 * IRONLOG "current hours" can drift when asset_hours.total_hours is stale but
 * daily_hours or inspection readings carry newer meter values. Effective hours
 * combine all sources.
 *
 * A single typo (e.g. 1234561) must not win over real readings (e.g. 19647).
 * We take many candidates and apply robustMax() to drop obvious outliers.
 */

/** If the largest value is more than this multiple of the next, drop it (repeat). */
const OUTLIER_RATIO = 10;

/**
 * Readings at or above this are almost always typos (e.g. 1234561) when real hours are ~20k.
 * We still consider them if nothing else exists (fallback).
 */
const HARD_CAP = 500_000;

/**
 * @param {number[]} candidates - positive hour-meter style values
 * @returns {number}
 */
export function robustMax(candidates) {
  let v = [...new Set(candidates)]
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);

  while (v.length >= 2 && v[0] > OUTLIER_RATIO * v[1]) {
    v.shift();
  }

  return v.length ? v[0] : 0;
}

function robustMaxPreferPlausible(candidates) {
  const uniq = [...new Set(candidates)].filter((n) => Number.isFinite(n) && n > 0);
  const underCap = uniq.filter((n) => n < HARD_CAP);
  if (underCap.length) {
    return robustMax(underCap);
  }
  return robustMax(uniq);
}

function collectCandidates(db, assetId) {
  const candidates = [];

  const push = (x) => {
    const n = Number(x);
    if (Number.isFinite(n) && n > 0) candidates.push(n);
  };

  try {
    const row = db.prepare(`
      SELECT total_hours
      FROM asset_hours
      WHERE asset_id = ?
    `).get(assetId);
    push(row?.total_hours);
  } catch {
    // ignore
  }

  try {
    const rows = db.prepare(`
      SELECT opening_hours, closing_hours
      FROM daily_hours
      WHERE asset_id = ?
    `).all(assetId);
    for (const r of rows) {
      push(r?.opening_hours);
      push(r?.closing_hours);
    }
  } catch {
    // ignore
  }

  try {
    const rows = db.prepare(`
      SELECT hour_meter_reading AS h
      FROM inspections
      WHERE asset_id = ?
        AND hour_meter_reading IS NOT NULL
    `).all(assetId);
    for (const r of rows) push(r?.h);
  } catch {
    // ignore
  }

  try {
    const rows = db.prepare(`
      SELECT hour_meter_reading AS h
      FROM artisan_inspections
      WHERE asset_id = ?
        AND hour_meter_reading IS NOT NULL
    `).all(assetId);
    for (const r of rows) push(r?.h);
  } catch {
    // ignore
  }

  try {
    const rows = db.prepare(`
      SELECT hour_meter_reading AS h
      FROM manager_inspections
      WHERE asset_id = ?
        AND hour_meter_reading IS NOT NULL
    `).all(assetId);
    for (const r of rows) push(r?.h);
  } catch {
    // ignore
  }

  return candidates;
}

export function getEffectiveTotalHours(db, assetId) {
  const candidates = collectCandidates(db, assetId);
  return robustMaxPreferPlausible(candidates);
}

/**
 * If stored asset_hours is below the effective max from other tables, bump the row.
 * If stored was inflated by a bad outlier, lower it to the robust effective total.
 */
export function reconcileAndGetAssetHours(db, assetId) {
  const effective = getEffectiveTotalHours(db, assetId);
  let fallbackLastUpdated = null;

  try {
    db.prepare(`
      INSERT INTO asset_hours (asset_id, total_hours, last_updated)
      SELECT ?, 0, datetime('now')
      WHERE NOT EXISTS (
        SELECT 1 FROM asset_hours WHERE asset_id = ?
      )
    `).run(assetId, assetId);
  } catch {
    // ignore
  }

  try {
    const row = db.prepare(`
      SELECT total_hours, last_updated
      FROM asset_hours
      WHERE asset_id = ?
    `).get(assetId);
    const stored = row ? Number(row.total_hours || 0) : 0;
    fallbackLastUpdated = row?.last_updated ?? null;

    if (effective > 0 && effective !== stored) {
      db.prepare(`
        UPDATE asset_hours
        SET total_hours = ?, last_updated = datetime('now')
        WHERE asset_id = ?
      `).run(effective, assetId);
    }
  } catch {
    // ignore
  }

  let final = null;
  try {
    final = db.prepare(`
      SELECT total_hours, last_updated
      FROM asset_hours
      WHERE asset_id = ?
    `).get(assetId);
  } catch {
    // If asset_hours table doesn't exist yet on this server DB, return robust effective value.
    final = null;
  }

  return {
    total_hours: Number(final?.total_hours ?? effective ?? 0),
    last_updated: final?.last_updated ?? fallbackLastUpdated ?? null
  };
}
