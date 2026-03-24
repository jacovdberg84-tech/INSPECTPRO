const API = "/api";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function card(title, value, status = "ok") {
  return `
    <div class="summary-card ${status}">
      <div class="summary-label">${title}</div>
      <div class="summary-value">${value}</div>
    </div>
  `;
}

async function checkJson(url) {
  const res = await fetch(url);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

async function runOpsCheck() {
  const dateEl = document.getElementById("opsDate");
  const checksEl = document.getElementById("opsChecks");
  const overallEl = document.getElementById("opsOverall");
  const notesEl = document.getElementById("opsNotes");
  const date = dateEl?.value || today();

  checksEl.innerHTML = `<div class="history-empty">Running checks...</div>`;
  overallEl.className = "history-empty";
  overallEl.textContent = "Running checks...";
  notesEl.innerHTML = "";

  const [health, kpi, reminders, trend, quality] = await Promise.all([
    checkJson(`/health`),
    checkJson(`${API}/dashboard/kpi/daily?date=${encodeURIComponent(date)}`),
    checkJson(`${API}/dashboard/service/reminders`),
    checkJson(`${API}/dashboard/kpi/weekly-trend?end_date=${encodeURIComponent(date)}&days=7`),
    checkJson(`${API}/dashboard/kpi/data-quality?date=${encodeURIComponent(date)}`)
  ]);

  const assetsCount = Array.isArray(kpi.data?.assets) ? kpi.data.assets.length : 0;
  const remindersCount = Array.isArray(reminders.data?.reminders) ? reminders.data.reminders.length : 0;
  const trendCount = Array.isArray(trend.data?.trend) ? trend.data.trend.length : 0;
  const issuesTotal = Number(quality.data?.summary?.issues_total || 0);
  const highIssues = Number(quality.data?.summary?.high || 0);

  const allCoreOk = health.ok && kpi.ok && reminders.ok && trend.ok && quality.ok;
  const hasHighRiskData = highIssues > 0;

  checksEl.innerHTML = [
    card("API Health", health.ok ? "OK" : `Fail (${health.status})`, health.ok ? "ok" : "critical"),
    card("KPI Feed", kpi.ok ? `${assetsCount} assets` : `Fail (${kpi.status})`, kpi.ok ? "ok" : "critical"),
    card("Service Reminders", reminders.ok ? `${remindersCount} items` : `Fail (${reminders.status})`, reminders.ok ? "ok" : "critical"),
    card("Weekly Trend", trend.ok ? `${trendCount} days` : `Fail (${trend.status})`, trend.ok ? "ok" : "critical"),
    card("Data Quality", quality.ok ? `${issuesTotal} issues` : `Fail (${quality.status})`, !quality.ok || hasHighRiskData ? "risk" : "ok")
  ].join("");

  if (!allCoreOk) {
    overallEl.className = "history-empty";
    overallEl.textContent = "⚠ Action required: one or more core feeds failed.";
  } else if (hasHighRiskData) {
    overallEl.className = "history-empty";
    overallEl.textContent = "⚠ Systems online, but high-severity data quality issues detected.";
  } else if (issuesTotal > 0) {
    overallEl.className = "history-empty";
    overallEl.textContent = "✓ Systems healthy. Minor data quality issues to review.";
  } else {
    overallEl.className = "history-empty";
    overallEl.textContent = "✓ Fully healthy. Safe to start daily operations.";
  }

  const noteLines = [];
  if (hasHighRiskData) {
    noteLines.push("Review Data Quality Alerts in dashboard before relying on KPI decisions.");
  }
  if (reminders.ok && remindersCount > 0) {
    const overdue = (reminders.data.reminders || []).filter((r) => String(r.status || "").includes("OVERDUE")).length;
    noteLines.push(`Overdue service items: ${overdue}`);
  }
  if (!noteLines.length) {
    noteLines.push("No critical notes. Continue with normal workflow.");
  }
  notesEl.innerHTML = noteLines.map((n) => `<div class="history-card">${n}</div>`).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  const dateEl = document.getElementById("opsDate");
  const runBtn = document.getElementById("runOpsCheckBtn");
  if (dateEl) dateEl.value = today();
  if (runBtn) runBtn.addEventListener("click", runOpsCheck);
  runOpsCheck();
});
