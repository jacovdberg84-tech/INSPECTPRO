const API = "/api";
const AUTO_REFRESH_SECONDS = 600;
let nextRefreshSeconds = AUTO_REFRESH_SECONDS;
let countdownTimerId = null;
let refreshTickInFlight = false;
let latestKpiAssets = [];
let latestServiceReminders = [];
let latestWeeklyTrend = [];
let latestTopFailures = [];
let latestDataQuality = { summary: null, anomalies: [] };
let latestOperations = { totals: null, product_client_breakdown: [] };
let latestAlertCenter = { summary: null, reliability: null, alerts: [] };
let filterInputDebounceId = null;

async function applyCompanyBranding() {
  try {
    const res = await fetch("./company-profile.json?v=1");
    if (!res.ok) return;
    const profile = await res.json();
    if (!profile || typeof profile !== "object") return;

    const card = document.getElementById("companyBrandCard");
    const logo = document.getElementById("companyBrandLogo");
    const nameEl = document.getElementById("companyBrandName");
    const metaEl = document.getElementById("companyBrandMeta");
    const appBrandIcon = document.getElementById("appBrandIcon");

    const companyName = String(profile.company_name || "").trim();
    const companyMeta = String(profile.company_meta || "").trim();
    const logoUrl = String(profile.logo_url || "").trim();

    if (companyName && nameEl) {
      nameEl.textContent = companyName;
    }
    if (companyMeta && metaEl) {
      metaEl.textContent = companyMeta;
      metaEl.style.display = "block";
    } else if (metaEl) {
      metaEl.textContent = "";
      metaEl.style.display = "none";
    }
    if (logo && logoUrl) {
      logo.src = logoUrl;
      logo.style.display = "block";
    } else if (logo) {
      logo.style.display = "none";
    }

    if (card && (companyName || companyMeta || logoUrl)) {
      card.style.display = "flex";
    }
    if (appBrandIcon && String(profile.hide_default_icon || "").toLowerCase() === "true") {
      appBrandIcon.style.display = "none";
    }
  } catch {
    // Branding file is optional; fail silently.
  }
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(d) {
  const dt = d instanceof Date ? d : new Date();
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function updateRefreshMeta() {
  const lastUpdatedEl = document.getElementById("lastUpdated");
  const nextRefreshEl = document.getElementById("nextRefresh");

  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = `Last updated: ${formatTime(new Date())}`;
  }
  if (nextRefreshEl) {
    nextRefreshEl.textContent = `Next refresh in: ${nextRefreshSeconds}s`;
  }
}

function startAutoRefresh(onTick) {
  if (countdownTimerId) {
    clearInterval(countdownTimerId);
  }
  nextRefreshSeconds = AUTO_REFRESH_SECONDS;
  updateRefreshMeta();

  countdownTimerId = setInterval(async () => {
    if (document.hidden) return;
    if (refreshTickInFlight) return;

    nextRefreshSeconds -= 1;
    if (nextRefreshSeconds <= 0) {
      nextRefreshSeconds = AUTO_REFRESH_SECONDS;
      refreshTickInFlight = true;
      try {
        await onTick();
      } finally {
        refreshTickInFlight = false;
        updateRefreshMeta();
      }
      return;
    }
    updateRefreshMeta();
  }, 1000);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function csvEscape(value) {
  const v = String(value ?? "");
  if (/[",\n]/.test(v)) {
    return `"${v.replaceAll('"', '""')}"`;
  }
  return v;
}

function downloadCsv(filename, headers, rows) {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getStatusColor(status) {
  if (status === "CRITICAL" || status === "CRITICAL OVERDUE") return "red";
  if (status === "RISK" || status === "OVERDUE") return "orange";
  if (status === "DUE SOON") return "#b8860b";
  return "green";
}

function toStatusClass(status) {
  const s = String(status || "").toUpperCase();
  if (["CRITICAL", "CRITICAL OVERDUE"].includes(s)) return "critical";
  if (["RISK", "OVERDUE"].includes(s)) return "risk";
  if (s === "DUE SOON") return "soon";
  return "ok";
}

function getFilterState() {
  const statusEl = document.getElementById("statusFilter");
  const searchEl = document.getElementById("assetSearch");
  return {
    status: String(statusEl?.value || "ALL").toUpperCase(),
    term: String(searchEl?.value || "").trim().toLowerCase()
  };
}

function matchesAssetFilter(row, filter) {
  const code = String(row.asset_code || "").toLowerCase();
  const name = String(row.asset_name || "").toLowerCase();
  const status = String(row.status || "").toUpperCase();
  const matchesText = !filter.term || code.includes(filter.term) || name.includes(filter.term);
  if (!matchesText) return false;
  if (filter.status === "ALL") return true;
  if (filter.status === "OK") return status === "OK" || status === "HEALTHY";
  return status === filter.status;
}

function matchesReminderFilter(row, filter) {
  const code = String(row.asset_code || "").toLowerCase();
  const name = String(row.asset_name || "").toLowerCase();
  const status = String(row.status || "").toUpperCase();
  const matchesText = !filter.term || code.includes(filter.term) || name.includes(filter.term);
  if (!matchesText) return false;
  if (filter.status === "ALL") return true;
  if (filter.status === "OVERDUE") return status.includes("OVERDUE");
  if (filter.status === "OK") return status === "OK";
  return true;
}

function renderSummary(assets, reminders) {
  const container = document.getElementById("summaryCards");
  if (!container) return;

  const totalAssets = assets.length;
  const criticalAssets = assets.filter((a) => String(a.status || "").toUpperCase() === "CRITICAL").length;
  const riskAssets = assets.filter((a) => String(a.status || "").toUpperCase() === "RISK").length;
  const avgUptime = totalAssets
    ? (assets.reduce((sum, a) => sum + Number(a.uptime_pct || 0), 0) / totalAssets)
    : 0;
  const avgAvailability = totalAssets
    ? (assets.reduce((sum, a) => sum + Number(a.availability || 0), 0) / totalAssets)
    : 0;
  const avgUtilization = totalAssets
    ? (assets.reduce((sum, a) => sum + Number(a.utilization || 0), 0) / totalAssets)
    : 0;
  const overdueServices = reminders.filter((r) =>
    ["OVERDUE", "CRITICAL OVERDUE"].includes(String(r.status || "").toUpperCase())
  ).length;

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Assets Reviewed</div>
      <div class="summary-value">${totalAssets}</div>
    </div>
    <div class="summary-card critical">
      <div class="summary-label">Critical Assets</div>
      <div class="summary-value">${criticalAssets}</div>
    </div>
    <div class="summary-card risk">
      <div class="summary-label">Assets At Risk</div>
      <div class="summary-value">${riskAssets}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Avg Uptime</div>
      <div class="summary-value">${avgUptime.toFixed(1)}%</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Avg Availability</div>
      <div class="summary-value">${avgAvailability.toFixed(1)}%</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Avg Utilization</div>
      <div class="summary-value">${avgUtilization.toFixed(1)}%</div>
    </div>
    <div class="summary-card soon">
      <div class="summary-label">Overdue Services</div>
      <div class="summary-value">${overdueServices}</div>
    </div>
  `;
}

function renderDataQuality() {
  const summaryEl = document.getElementById("dataQualitySummary");
  const listEl = document.getElementById("dataQualityList");
  if (!summaryEl || !listEl) return;

  const summary = latestDataQuality.summary;
  const anomalies = Array.isArray(latestDataQuality.anomalies) ? latestDataQuality.anomalies : [];

  if (!summary) {
    summaryEl.innerHTML = `<div class="history-empty">Loading data quality...</div>`;
    listEl.innerHTML = "";
    return;
  }

  summaryEl.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Assets Checked</div>
      <div class="summary-value">${Number(summary.total_assets || 0)}</div>
    </div>
    <div class="summary-card critical">
      <div class="summary-label">High Issues</div>
      <div class="summary-value">${Number(summary.high || 0)}</div>
    </div>
    <div class="summary-card risk">
      <div class="summary-label">Medium Issues</div>
      <div class="summary-value">${Number(summary.medium || 0)}</div>
    </div>
    <div class="summary-card soon">
      <div class="summary-label">Low Issues</div>
      <div class="summary-value">${Number(summary.low || 0)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Issues</div>
      <div class="summary-value">${Number(summary.issues_total || 0)}</div>
    </div>
  `;

  if (!anomalies.length) {
    listEl.innerHTML = `<div class="history-empty">No data quality issues detected for selected date.</div>`;
    return;
  }

  listEl.innerHTML = anomalies.map((a) => {
    const levelClass = a.severity === "high" ? "critical" : a.severity === "medium" ? "risk" : "soon";
    return `
      <div class="history-card manager-card ${levelClass}">
        <div class="manager-card-top">
          <strong>${escapeHtml(a.asset_code || "Unknown")}</strong> - ${escapeHtml(a.asset_name || "")}
          <span class="manager-chip ${levelClass}">${escapeHtml(String(a.severity || "low").toUpperCase())}</span>
        </div>
        <div class="history-line"><strong>${escapeHtml(a.code || "ISSUE")}:</strong> ${escapeHtml(a.detail || "")}</div>
      </div>
    `;
  }).join("");
}

function renderOperationsSummary() {
  const summaryEl = document.getElementById("operationsSummary");
  const breakdownEl = document.getElementById("operationsBreakdown");
  if (!summaryEl || !breakdownEl) return;

  const totals = latestOperations.totals;
  const rows = Array.isArray(latestOperations.product_client_breakdown)
    ? latestOperations.product_client_breakdown
    : [];

  if (!totals) {
    summaryEl.innerHTML = `<div class="history-empty">Loading operations...</div>`;
    breakdownEl.innerHTML = "";
    return;
  }

  summaryEl.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Tonnes Moved</div>
      <div class="summary-value">${Number(totals.tonnes_moved || 0).toFixed(1)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Product Produced</div>
      <div class="summary-value">${Number(totals.product_produced || 0).toFixed(1)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Weighbridge Total</div>
      <div class="summary-value">${Number(totals.amount_produced || 0).toFixed(1)}</div>
    </div>
    <div class="summary-card soon">
      <div class="summary-label">Total Truck Loads</div>
      <div class="summary-value">${Number(totals.total_truck_loads || 0)}</div>
    </div>
  `;

  if (!rows.length) {
    breakdownEl.innerHTML = `<div class="history-empty">No product/client operations captured for selected date.</div>`;
    return;
  }

  breakdownEl.innerHTML = `
    <div class="history-card">
      <strong>Product -> Client Breakdown</strong>
      <div class="ops-grid-head">
        <span>Product - Client</span>
        <span>Loads</span>
        <span>Amount</span>
      </div>
      ${rows.map((r) => `
        <div class="ops-grid-row">
          <span>${escapeHtml(r.product_type || "")} - ${escapeHtml(r.client_name || "")}</span>
          <span>${Number(r.truck_loads || 0)}</span>
          <span>${Number(r.amount_produced || 0).toFixed(1)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAlertCenter() {
  const summaryEl = document.getElementById("alertCenterSummary");
  const listEl = document.getElementById("alertCenterList");
  if (!summaryEl || !listEl) return;

  const summary = latestAlertCenter.summary;
  const reliability = latestAlertCenter.reliability;
  const alerts = Array.isArray(latestAlertCenter.alerts) ? latestAlertCenter.alerts : [];

  if (!summary) {
    summaryEl.innerHTML = `<div class="history-empty">Loading alert center...</div>`;
    listEl.innerHTML = "";
    return;
  }

  const mtbfText = reliability?.available && reliability.mtbf_hours !== null
    ? `${Number(reliability.mtbf_hours).toFixed(2)} h`
    : "--";
  const mttrText = reliability?.available && reliability.mttr_hours !== null
    ? `${Number(reliability.mttr_hours).toFixed(2)} h`
    : "--";

  summaryEl.innerHTML = `
    <div class="summary-card critical">
      <div class="summary-label">Critical Alerts</div>
      <div class="summary-value">${Number(summary.critical_total || 0)}</div>
    </div>
    <div class="summary-card risk">
      <div class="summary-label">High Alerts</div>
      <div class="summary-value">${Number(summary.high_total || 0)}</div>
    </div>
    <div class="summary-card soon">
      <div class="summary-label">Overdue Services</div>
      <div class="summary-value">${Number(summary.overdue_services || 0)}</div>
    </div>
    <div class="summary-card risk">
      <div class="summary-label">Repeated Failures</div>
      <div class="summary-value">${Number(summary.repeated_component_failures || 0)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Fleet MTBF</div>
      <div class="summary-value">${mtbfText}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Fleet MTTR</div>
      <div class="summary-value">${mttrText}</div>
    </div>
  `;

  if (!alerts.length) {
    listEl.innerHTML = `<div class="history-empty">No critical alerts for selected date.</div>`;
    return;
  }

  listEl.innerHTML = alerts.map((a) => {
    const levelClass = a.severity === "critical" ? "critical" : "risk";
    return `
      <div class="history-card manager-card ${levelClass}">
        <div class="manager-card-top">
          <strong>${escapeHtml(a.asset_code || "Unknown")}</strong> - ${escapeHtml(a.asset_name || "")}
          <span class="manager-chip ${levelClass}">${escapeHtml(String(a.severity || "high").toUpperCase())}</span>
        </div>
        <div class="history-line"><strong>${escapeHtml(a.type || "ALERT")}:</strong> ${escapeHtml(a.title || "")}</div>
        <div class="history-line">${escapeHtml(a.detail || "")}</div>
      </div>
    `;
  }).join("");
}

function renderKpiFromCache() {
  const machineList = document.getElementById("machineKpiList");
  const topFailuresList = document.getElementById("topFailuresList");
  if (!machineList || !topFailuresList) return;

  const filter = getFilterState();
  const filteredAssets = latestKpiAssets.filter((row) => matchesAssetFilter(row, filter));
  const filteredReminders = latestServiceReminders.filter((row) => matchesReminderFilter(row, filter));
  renderSummary(filteredAssets, filteredReminders);

  if (!filteredAssets.length) {
    machineList.innerHTML = `<div class="history-empty">No KPI data for selected filter/date.</div>`;
  } else {
    machineList.innerHTML = filteredAssets.map((row) => {
      const color = getStatusColor(row.status);
      const statusClass = toStatusClass(row.status);
      return `
        <div class="history-card manager-card ${statusClass}">
          <div class="manager-card-top">
            <strong>${escapeHtml(row.asset_code)}</strong> - ${escapeHtml(row.asset_name)}
            <span class="manager-chip ${statusClass}" style="color:${color}">${escapeHtml(row.status || "UNKNOWN")}</span>
          </div>
          <div class="manager-metrics">
            <div><span class="metric-label">Scheduled</span>${Number(row.scheduled_hours || 0).toFixed(1)} hrs</div>
            <div><span class="metric-label">Available</span>${Number(row.available_hours || 0).toFixed(1)} hrs</div>
            <div><span class="metric-label">Run</span>${Number(row.hours_run || 0).toFixed(1)} hrs</div>
            <div><span class="metric-label">Downtime</span>${Number(row.downtime_hours || 0).toFixed(1)} hrs</div>
            <div><span class="metric-label">Breakdowns</span>${Number(row.breakdown_count || 0)}</div>
            <div><span class="metric-label">Availability</span>${Number(row.availability || 0).toFixed(1)}%</div>
            <div><span class="metric-label">Utilization</span>${Number(row.utilization || 0).toFixed(1)}%</div>
          </div>
          <div class="manager-uptime">Uptime: <strong>${Number(row.uptime_pct || 0).toFixed(1)}%</strong></div>
        </div>
      `;
    }).join("");
  }

  if (!latestTopFailures.length) {
    topFailuresList.innerHTML = `<div class="history-empty">No failures for selected date.</div>`;
  } else {
    topFailuresList.innerHTML = latestTopFailures.map((f, idx) => `
      <div class="history-card manager-card">
        <div class="manager-card-top">
          <strong>#${idx + 1} ${escapeHtml(f.component || "Unknown")}</strong>
        </div>
        <div class="manager-metrics">
          <div><span class="metric-label">Breakdowns</span>${Number(f.count || 0)}</div>
          <div><span class="metric-label">Downtime</span>${Number(f.downtime || 0).toFixed(1)} hrs</div>
        </div>
      </div>
    `).join("");
  }
}

function renderServiceRemindersFromCache() {
  const reminderList = document.getElementById("serviceReminderList");
  if (!reminderList) return;

  const filter = getFilterState();
  const filteredReminders = latestServiceReminders.filter((row) => matchesReminderFilter(row, filter));
  if (!filteredReminders.length) {
    reminderList.innerHTML = `<div class="history-empty">No service reminders found.</div>`;
    return;
  }

  reminderList.innerHTML = filteredReminders.map((row) => {
    const color = getStatusColor(row.status);
    const statusClass = toStatusClass(row.status);

    return `
      <div class="history-card manager-card ${statusClass}">
        <div class="manager-card-top">
          <strong>${escapeHtml(row.asset_code || "")}</strong> - ${escapeHtml(row.asset_name || "")}
          <span class="manager-chip ${statusClass}" style="color:${color}">${escapeHtml(row.status || "UNKNOWN")}</span>
        </div>
        <div>Service: ${escapeHtml(row.service_name || row.plan_name || "Planned Service")}</div>
        <div class="manager-metrics">
          <div><span class="metric-label">Current</span>${Number(row.current_hours || 0).toFixed(1)}</div>
          <div><span class="metric-label">Due At</span>${Number(row.due_at_hours || 0).toFixed(1)}</div>
          <div><span class="metric-label">Remaining</span>${Number(row.hours_remaining || 0).toFixed(1)}</div>
        </div>
      </div>
    `;
  }).join("");
}

async function loadKPI() {
  const dateEl = document.getElementById("date");
  const machineList = document.getElementById("machineKpiList");
  const topFailuresList = document.getElementById("topFailuresList");
  const summaryCards = document.getElementById("summaryCards");

  if (!dateEl || !machineList || !topFailuresList) {
    console.error("Dashboard KPI elements missing");
    return;
  }

  const date = dateEl.value;

  if (summaryCards) {
    summaryCards.innerHTML = `<div class="history-empty">Loading summary...</div>`;
  }
  machineList.innerHTML = `<div class="history-empty">Loading KPI...</div>`;
  topFailuresList.innerHTML = `<div class="history-empty">Loading failures...</div>`;

  try {
    const [kpiRes, remindersRes] = await Promise.all([
      fetch(`${API}/dashboard/kpi/daily?date=${encodeURIComponent(date)}`),
      fetch(`${API}/dashboard/service/reminders`)
    ]);

    const kpiResponse = await kpiRes.json();
    if (!kpiRes.ok) {
      throw new Error(kpiResponse.error || "Failed to load KPI");
    }

    let reminders = [];
    if (remindersRes.ok) {
      const remindersResponse = await remindersRes.json();
      reminders = Array.isArray(remindersResponse.reminders) ? remindersResponse.reminders : [];
    }

    const assets = Array.isArray(kpiResponse.assets) ? kpiResponse.assets : [];
    const topFailures = Array.isArray(kpiResponse.top_failures) ? kpiResponse.top_failures : [];
    latestKpiAssets = assets;
    latestTopFailures = topFailures;
    if (!latestServiceReminders.length && reminders.length) {
      latestServiceReminders = reminders;
    }
    renderKpiFromCache();
  } catch (err) {
    console.error(err);
    machineList.innerHTML = `<div class="history-empty">Failed to load KPI: ${escapeHtml(err.message)}</div>`;
    topFailuresList.innerHTML = `<div class="history-empty">Could not load top failures.</div>`;
  }
}

async function loadServiceReminders() {
  const reminderList = document.getElementById("serviceReminderList");
  if (!reminderList) return;

  reminderList.innerHTML = `<div class="history-empty">Loading reminders...</div>`;

  try {
    const res = await fetch(`${API}/dashboard/service/reminders`);

    if (!res.ok) {
      if (res.status === 404) {
        reminderList.innerHTML = `<div class="history-empty">Service reminders route not added yet.</div>`;
        return;
      }

      let message = `Failed to load service reminders (${res.status})`;
      const text = await res.text();
      if (text) message = text;

      throw new Error(message);
    }

    const response = await res.json();
    const reminders = Array.isArray(response.reminders) ? response.reminders : [];

    latestServiceReminders = reminders;
    renderServiceRemindersFromCache();
    renderKpiFromCache();
  } catch (err) {
    console.error(err);
    reminderList.innerHTML = `<div class="history-empty">Service reminders unavailable: ${escapeHtml(err.message)}</div>`;
  }
}

async function loadDataQuality() {
  const summaryEl = document.getElementById("dataQualitySummary");
  const listEl = document.getElementById("dataQualityList");
  const dateEl = document.getElementById("date");
  if (!summaryEl || !listEl || !dateEl) return;

  summaryEl.innerHTML = `<div class="history-empty">Loading data quality...</div>`;
  listEl.innerHTML = "";
  const date = dateEl.value || getToday();

  try {
    const res = await fetch(`${API}/dashboard/kpi/data-quality?date=${encodeURIComponent(date)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to load data quality");
    }
    latestDataQuality = {
      summary: data.summary || null,
      anomalies: Array.isArray(data.anomalies) ? data.anomalies : []
    };
    renderDataQuality();
  } catch (err) {
    console.error(err);
    summaryEl.innerHTML = `<div class="history-empty">Data quality unavailable: ${escapeHtml(err.message)}</div>`;
    listEl.innerHTML = "";
  }
}

async function loadOperationsSummary() {
  const summaryEl = document.getElementById("operationsSummary");
  const breakdownEl = document.getElementById("operationsBreakdown");
  const dateEl = document.getElementById("date");
  if (!summaryEl || !breakdownEl || !dateEl) return;

  summaryEl.innerHTML = `<div class="history-empty">Loading operations...</div>`;
  breakdownEl.innerHTML = "";

  const date = dateEl.value || getToday();
  try {
    const res = await fetch(`${API}/dashboard/operations/summary?date=${encodeURIComponent(date)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to load operations summary");
    }

    latestOperations = {
      totals: data.totals || null,
      product_client_breakdown: Array.isArray(data.product_client_breakdown) ? data.product_client_breakdown : []
    };
    renderOperationsSummary();
  } catch (err) {
    console.error(err);
    summaryEl.innerHTML = `<div class="history-empty">Operations summary unavailable: ${escapeHtml(err.message)}</div>`;
    breakdownEl.innerHTML = "";
  }
}

async function loadAlertCenter() {
  const summaryEl = document.getElementById("alertCenterSummary");
  const listEl = document.getElementById("alertCenterList");
  const dateEl = document.getElementById("date");
  if (!summaryEl || !listEl || !dateEl) return;

  summaryEl.innerHTML = `<div class="history-empty">Loading alert center...</div>`;
  listEl.innerHTML = "";
  const date = dateEl.value || getToday();

  try {
    const res = await fetch(`${API}/dashboard/alerts/center?date=${encodeURIComponent(date)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to load alert center");
    }

    latestAlertCenter = {
      summary: data.summary || null,
      reliability: data.reliability || null,
      alerts: Array.isArray(data.alerts) ? data.alerts : []
    };
    renderAlertCenter();
  } catch (err) {
    console.error(err);
    summaryEl.innerHTML = `<div class="history-empty">Alert center unavailable: ${escapeHtml(err.message)}</div>`;
    listEl.innerHTML = "";
  }
}

function renderWeeklyTrendChart(trend) {
  const chartEl = document.getElementById("weeklyTrendChart");
  if (!chartEl) return;
  if (!trend.length) {
    chartEl.innerHTML = `<div class="history-empty">No chart data.</div>`;
    return;
  }

  const width = 860;
  const height = 220;
  const padding = 28;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const xStep = trend.length > 1 ? innerW / (trend.length - 1) : 0;

  const toY = (v) => {
    const n = Number.isFinite(Number(v)) ? Number(v) : 0;
    return padding + ((100 - Math.max(0, Math.min(100, n))) / 100) * innerH;
  };

  const points = (key) => trend.map((d, i) => `${(padding + i * xStep).toFixed(1)},${toY(d[key]).toFixed(1)}`).join(" ");
  const labels = trend.map((d, i) => `<text x="${(padding + i * xStep).toFixed(1)}" y="${height - 6}" text-anchor="middle" class="trend-axis-label">${escapeHtml(d.date.slice(5))}</text>`).join("");
  const grid = [0, 25, 50, 75, 100].map((v) => {
    const y = toY(v).toFixed(1);
    return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" class="trend-grid" />
      <text x="6" y="${(Number(y) + 4).toFixed(1)}" class="trend-axis-label">${v}%</text>`;
  }).join("");

  chartEl.innerHTML = `
    <div class="trend-legend">
      <span><i class="dot avail"></i>Availability</span>
      <span><i class="dot util"></i>Utilization</span>
      <span><i class="dot up"></i>Uptime</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" class="trend-svg" role="img" aria-label="Weekly trend chart">
      ${grid}
      <polyline points="${points("availability")}" class="trend-line avail" />
      <polyline points="${points("utilization")}" class="trend-line util" />
      <polyline points="${points("uptime_pct")}" class="trend-line up" />
      ${labels}
    </svg>
  `;
}

async function loadWeeklyTrend() {
  const trendList = document.getElementById("weeklyTrendList");
  const dateEl = document.getElementById("date");
  if (!trendList || !dateEl) return;

  trendList.innerHTML = `<div class="history-empty">Loading weekly trend...</div>`;
  const endDate = dateEl.value || getToday();

  try {
    const res = await fetch(`${API}/dashboard/kpi/weekly-trend?end_date=${encodeURIComponent(endDate)}&days=7`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to load weekly trend");
    }

    const trend = Array.isArray(data.trend) ? data.trend : [];
    latestWeeklyTrend = trend;
    renderWeeklyTrendChart(trend);

    if (!trend.length) {
      trendList.innerHTML = `<div class="history-empty">No weekly trend data found.</div>`;
      return;
    }

    trendList.innerHTML = trend.map((d) => {
      const availabilityPct = Number(d.availability || 0);
      const utilizationPct = Number(d.utilization || 0);
      const uptimePct = Number(d.uptime_pct || 0);

      return `
        <div class="history-card trend-card">
          <div class="manager-card-top">
            <strong>${escapeHtml(d.date)}</strong>
            <span class="manager-chip ${toStatusClass(uptimePct < 70 ? "CRITICAL" : uptimePct < 85 ? "RISK" : "OK")}">
              Uptime ${uptimePct.toFixed(1)}%
            </span>
          </div>
          <div class="manager-metrics">
            <div><span class="metric-label">Scheduled</span>${Number(d.scheduled_hours || 0).toFixed(1)} hrs</div>
            <div><span class="metric-label">Available</span>${Number(d.available_hours || 0).toFixed(1)} hrs</div>
            <div><span class="metric-label">Run</span>${Number(d.hours_run || 0).toFixed(1)} hrs</div>
            <div><span class="metric-label">Downtime</span>${Number(d.downtime_hours || 0).toFixed(1)} hrs</div>
            <div><span class="metric-label">Breakdowns</span>${Number(d.breakdown_count || 0)}</div>
          </div>
          <div class="trend-bars">
            <div class="trend-row">
              <span>Availability</span>
              <div class="trend-bar"><i style="width:${Math.max(0, Math.min(100, availabilityPct))}%"></i></div>
              <strong>${availabilityPct.toFixed(1)}%</strong>
            </div>
            <div class="trend-row">
              <span>Utilization</span>
              <div class="trend-bar"><i style="width:${Math.max(0, Math.min(100, utilizationPct))}%"></i></div>
              <strong>${utilizationPct.toFixed(1)}%</strong>
            </div>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error(err);
    trendList.innerHTML = `<div class="history-empty">Weekly trend unavailable: ${escapeHtml(err.message)}</div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const dateEl = document.getElementById("date");
  const refreshBtn = document.getElementById("refreshBtn");
  const exportKpiBtn = document.getElementById("exportKpiBtn");
  const exportRemindersBtn = document.getElementById("exportRemindersBtn");
  const statusFilterEl = document.getElementById("statusFilter");
  const assetSearchEl = document.getElementById("assetSearch");

  if (!dateEl) {
    console.error("Dashboard date input missing");
    return;
  }

  dateEl.value = getToday();
  const refreshAll = async () => {
    await Promise.all([loadKPI(), loadServiceReminders(), loadWeeklyTrend(), loadDataQuality(), loadOperationsSummary(), loadAlertCenter()]);
  };

  dateEl.addEventListener("change", refreshAll);
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      await refreshAll();
      nextRefreshSeconds = AUTO_REFRESH_SECONDS;
      updateRefreshMeta();
    });
  }

  if (exportKpiBtn) {
    exportKpiBtn.addEventListener("click", () => {
      const date = dateEl.value || getToday();
      const filter = getFilterState();
      const rows = latestKpiAssets.filter((a) => matchesAssetFilter(a, filter)).map((a) => [
        date,
        a.asset_code || "",
        a.asset_name || "",
        Number(a.scheduled_hours || 0).toFixed(1),
        Number(a.available_hours || 0).toFixed(1),
        Number(a.hours_run || 0).toFixed(1),
        Number(a.downtime_hours || 0).toFixed(1),
        Number(a.breakdown_count || 0),
        Number(a.availability || 0).toFixed(1),
        Number(a.utilization || 0).toFixed(1),
        Number(a.uptime_pct || 0).toFixed(1),
        a.status || ""
      ]);
      downloadCsv(
        `inspectpro-kpi-${date}.csv`,
        ["date", "asset_code", "asset_name", "scheduled_hours", "available_hours", "hours_run", "downtime_hours", "breakdown_count", "availability_pct", "utilization_pct", "uptime_pct", "status"],
        rows
      );
    });
  }

  if (exportRemindersBtn) {
    exportRemindersBtn.addEventListener("click", () => {
      const date = dateEl.value || getToday();
      const filter = getFilterState();
      const rows = latestServiceReminders.filter((r) => matchesReminderFilter(r, filter)).map((r) => [
        date,
        r.asset_code || "",
        r.asset_name || "",
        r.service_name || r.plan_name || "",
        Number(r.current_hours || 0).toFixed(1),
        Number(r.due_at_hours || 0).toFixed(1),
        Number(r.hours_remaining || 0).toFixed(1),
        r.status || ""
      ]);
      downloadCsv(
        `inspectpro-service-reminders-${date}.csv`,
        ["date", "asset_code", "asset_name", "service_name", "current_hours", "due_at_hours", "hours_remaining", "status"],
        rows
      );
    });
  }

  applyCompanyBranding();

  refreshAll().then(() => {
    updateRefreshMeta();
    startAutoRefresh(refreshAll);
  });

  const rerenderFiltered = () => {
    renderKpiFromCache();
    renderServiceRemindersFromCache();
  };
  if (statusFilterEl) statusFilterEl.addEventListener("change", rerenderFiltered);
  if (assetSearchEl) {
    assetSearchEl.addEventListener("input", () => {
      if (filterInputDebounceId) {
        clearTimeout(filterInputDebounceId);
      }
      filterInputDebounceId = setTimeout(() => {
        rerenderFiltered();
      }, 150);
    });
  }

  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
      return;
    }

    if (refreshTickInFlight) {
      return;
    }

    refreshTickInFlight = true;
    try {
      await refreshAll();
      nextRefreshSeconds = AUTO_REFRESH_SECONDS;
      updateRefreshMeta();
    } finally {
      refreshTickInFlight = false;
    }
  });
});