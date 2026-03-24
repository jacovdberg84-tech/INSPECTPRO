const API = "/api";

let selectedAsset = null;
let selectedBtn = null;
let isSubmittingInspection = false;
let isSubmittingBreakdown = false;
let currentLang = "en";
let currentAssetHours = 0;
let selectedAssetMeta = null;

const checklist = {
  tyres: "ok",
  lights: "ok",
  fluids: "ok",
  leaks: "ok",
  hydraulics: "ok",
  safety_equipment: "ok",
  engine: "ok",
  brakes: "ok",
  horn: "ok",
  reverse_alarm: "ok",
  fire_extinguisher: "ok",
  seat_belt: "ok",
  mirrors: "ok",
  battery: "ok",
  undercarriage: "ok",
  attachment: "ok",
};

const translations = {
  en: {
    app_title: "InspectPro",
    app_subtitle: "Operator field app",
    tab_inspection: "Daily Inspection",
    tab_breakdown: "Breakdown Report",
    tab_history: "My History",
    operator_name: "Operator Name",
    date: "Date",
    signature: "Signature",
    load_machines: "Load Machines",
    operator_hint: "Type your name, then load your allocated machines.",
    select_machine: "Select Machine",
    selected_machine: "Selected Machine",
    no_machine_selected: "No machine selected yet",
    select_machine_first: "Please select a machine on the inspection tab first.",
    current_hours: "Current IRONLOG Hours",
    new_hour_reading: "New Hour Meter Reading",
    inspection_checklist: "Inspection Checklist",
    section_mechanical: "Mechanical",
    section_electrical: "Electrical",
    section_safety: "Safety",
    section_general: "General",
    item_engine: "Engine",
    item_hydraulics: "Hydraulics",
    item_leaks: "Leaks",
    item_undercarriage: "Undercarriage",
    item_attachment: "Attachment / Tool",
    item_lights: "Lights",
    item_battery: "Battery",
    item_reverse_alarm: "Reverse Alarm",
    item_horn: "Horn",
    item_brakes: "Brakes",
    item_seat_belt: "Seat Belt",
    item_fire_extinguisher: "Fire Extinguisher",
    item_mirrors: "Mirrors",
    item_safety_equipment: "Safety Equipment",
    item_tyres: "Tyres",
    item_fluids: "Fluids",
    status_ok: "OK",
    status_attention: "Attention",
    status_unsafe: "Unsafe",
    overall_status: "Overall Status",
    notes: "Notes",
    submit_inspection: "Submit Inspection",
    time_down: "Time Down",
    component: "Component",
    issue: "Issue",
    hours_down: "Hours Down",
    submit_breakdown: "Submit Breakdown Report",
    my_history: "My History",
    refresh: "Refresh",
    machine: "Machine",
    breakdown_number: "Breakdown",
    work_order_number: "Work Order",
    inspection_history: "Inspection History",
    breakdown_history: "Breakdown History",
    no_inspection_history: "No inspections found yet.",
    no_breakdown_history: "No breakdown reports found yet.",
    wo_status: "WO Status",
    inspection_status: "Inspection Status",
    msg_enter_operator: "Please enter operator name.",
    msg_enter_signature: "Please type your signature.",
    msg_select_machine: "Please select a machine.",
    msg_enter_hours: "Please enter current hour meter reading.",
    msg_inspection_saved: "Inspection saved successfully.",
    msg_breakdown_saved: "Breakdown reported successfully.",
    msg_history_empty: "No history found yet.",
    msg_loading: "Loading...",
    msg_machine_load_fail: "Failed to load machines.",
    msg_history_load_fail: "Failed to load history.",
    msg_breakdown_issue: "Please enter the breakdown issue.",
    msg_hours_warning_prefix: "Warning",
    msg_allocated_none: "No allocated machines found. Showing all assets.",
    placeholder_operator: "Enter operator name",
    placeholder_signature: "Type name as signature",
    placeholder_hours: "e.g. 12543.6",
    placeholder_notes: "Inspection notes...",
    placeholder_issue: "Describe the issue",
    placeholder_bd_notes: "Breakdown notes...",
    status_label_ok: "OK",
    status_label_attention: "ATTENTION",
    status_label_unsafe: "UNSAFE"
  },
  pt: {
    app_title: "InspectPro",
    app_subtitle: "Aplicação de campo do operador",
    tab_inspection: "Inspeção Diária",
    tab_breakdown: "Relatório de Avaria",
    tab_history: "Meu Histórico",
    operator_name: "Nome do Operador",
    date: "Data",
    signature: "Assinatura",
    load_machines: "Carregar Máquinas",
    operator_hint: "Digite o seu nome e depois carregue as suas máquinas atribuídas.",
    select_machine: "Selecionar Máquina",
    selected_machine: "Máquina Selecionada",
    no_machine_selected: "Nenhuma máquina selecionada",
    select_machine_first: "Selecione primeiro uma máquina no separador de inspeção.",
    current_hours: "Horas Atuais no IRONLOG",
    new_hour_reading: "Nova Leitura do Horímetro",
    inspection_checklist: "Lista de Inspeção",
    section_mechanical: "Mecânico",
    section_electrical: "Elétrico",
    section_safety: "Segurança",
    section_general: "Geral",
    item_engine: "Motor",
    item_hydraulics: "Hidráulica",
    item_leaks: "Fugas",
    item_undercarriage: "Material Rodante",
    item_attachment: "Acessório / Ferramenta",
    item_lights: "Luzes",
    item_battery: "Bateria",
    item_reverse_alarm: "Alarme de Ré",
    item_horn: "Buzina",
    item_brakes: "Travões",
    item_seat_belt: "Cinto de Segurança",
    item_fire_extinguisher: "Extintor",
    item_mirrors: "Espelhos",
    item_safety_equipment: "Equipamento de Segurança",
    item_tyres: "Pneus",
    item_fluids: "Fluidos",
    status_ok: "OK",
    status_attention: "Atenção",
    status_unsafe: "Inseguro",
    overall_status: "Estado Geral",
    notes: "Notas",
    submit_inspection: "Enviar Inspeção",
    time_down: "Hora da Paragem",
    component: "Componente",
    issue: "Problema",
    hours_down: "Horas na Paragem",
    submit_breakdown: "Enviar Relatório de Avaria",
    my_history: "Meu Histórico",
    refresh: "Atualizar",
    machine: "Máquina",
    breakdown_number: "Avaria",
    work_order_number: "OT",
    inspection_history: "Histórico de Inspeções",
    breakdown_history: "Histórico de Avarias",
    no_inspection_history: "Ainda não existem inspeções.",
    no_breakdown_history: "Ainda não existem avarias reportadas.",
    wo_status: "Estado da OT",
    inspection_status: "Estado da Inspeção",
    msg_enter_operator: "Por favor, introduza o nome do operador.",
    msg_enter_signature: "Por favor, escreva a sua assinatura.",
    msg_select_machine: "Por favor, selecione uma máquina.",
    msg_enter_hours: "Por favor, introduza a leitura atual do horímetro.",
    msg_inspection_saved: "Inspeção guardada com sucesso.",
    msg_breakdown_saved: "Avaria reportada com sucesso.",
    msg_history_empty: "Ainda não existe histórico.",
    msg_loading: "A carregar...",
    msg_machine_load_fail: "Falha ao carregar máquinas.",
    msg_history_load_fail: "Falha ao carregar histórico.",
    msg_breakdown_issue: "Por favor, descreva a avaria.",
    msg_hours_warning_prefix: "Aviso",
    msg_allocated_none: "Nenhuma máquina atribuída encontrada. A mostrar todas as máquinas.",
    placeholder_operator: "Introduza o nome do operador",
    placeholder_signature: "Escreva o nome como assinatura",
    placeholder_hours: "ex. 12543.6",
    placeholder_notes: "Notas da inspeção...",
    placeholder_issue: "Descreva o problema",
    placeholder_bd_notes: "Notas da avaria...",
    status_label_ok: "OK",
    status_label_attention: "ATENÇÃO",
    status_label_unsafe: "INSEGURO"
  }
};

function t(key) {
  return translations[currentLang][key] || key;
}

function showMessage(text, type = "info") {
  const box = document.getElementById("messageBox");
  box.textContent = text;
  box.className = `message-box ${type}`;
  box.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showCollisionWarning(text) {
  const box = document.getElementById("warningBox");
  if (!box) return;
  box.textContent = `⚠ ${text}`;
  box.className = "message-box warning";
  box.style.display = "block";
}

function clearMessage() {
  const box = document.getElementById("messageBox");
  box.style.display = "none";
  box.textContent = "";

  const warningBox = document.getElementById("warningBox");
  if (warningBox) {
    warningBox.style.display = "none";
    warningBox.textContent = "";
  }
}

function formatToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatNowDisplay() {
  return new Date().toLocaleString();
}

function setDates() {
  document.getElementById("inspectionDate").value = formatToday();
  document.getElementById("bdDate").value = formatToday();
  document.getElementById("bdTimeDown").textContent = formatNowDisplay();
}

function applyLanguage(lang) {
  currentLang = lang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  document.getElementById("operator").placeholder = t("placeholder_operator");
  document.getElementById("operatorSignature").placeholder = t("placeholder_signature");
  document.getElementById("hourMeter").placeholder = t("placeholder_hours");
  document.getElementById("notes").placeholder = t("placeholder_notes");
  document.getElementById("bdOperator").placeholder = t("placeholder_operator");
  document.getElementById("bdSignature").placeholder = t("placeholder_signature");
  document.getElementById("bdIssue").placeholder = t("placeholder_issue");
  document.getElementById("bdHoursDown").placeholder = t("placeholder_hours");
  document.getElementById("bdNotes").placeholder = t("placeholder_bd_notes");

  document.getElementById("langEn").classList.toggle("active", lang === "en");
  document.getElementById("langPt").classList.toggle("active", lang === "pt");

  renderOverallStatus();
  renderSelectedMachineCard();
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.remove("active");
  });

  document.getElementById(`tab-${tabName}`).classList.add("active");

  if (tabName === "history") {
    loadHistory();
  }

  if (tabName === "breakdown") {
    document.getElementById("bdTimeDown").textContent = formatNowDisplay();
    renderSelectedMachineCard();
  }
}

function clearSelection() {
  selectedAsset = null;
  currentAssetHours = 0;
  selectedAssetMeta = null;
  document.getElementById("currentHours").textContent = "0.0";
  document.getElementById("bdCurrentHours").textContent = "0.0";
  document.getElementById("bdPhotos").value = "";
  if (selectedBtn) selectedBtn.classList.remove("selected");
  selectedBtn = null;

  renderSelectedMachineCard();
}

function renderSelectedMachineCard() {
  const card = document.getElementById("breakdownMachineCard");

  if (!selectedAssetMeta) {
    card.className = "selected-machine-card empty";
    card.innerHTML = `
      <div class="selected-machine-title">${t("no_machine_selected")}</div>
      <div class="selected-machine-sub">${t("select_machine_first")}</div>
    `;
    return;
  }

  card.className = "selected-machine-card";
  card.innerHTML = `
    <div class="selected-machine-code">${selectedAssetMeta.asset_code || ""}</div>
    <div class="selected-machine-title">${selectedAssetMeta.asset_name || ""}</div>
    <div class="selected-machine-sub">${t("current_hours")}: ${Number(currentAssetHours || 0).toFixed(1)}</div>
  `;
}

function renderAssets(assets) {
  const div = document.getElementById("assets");
  div.innerHTML = "";
  clearSelection();

  assets.forEach((a) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "machine-card";
    btn.innerHTML = `
      <span class="machine-code">${a.asset_code || ""}</span>
      <span class="machine-name">${a.asset_name || ""}</span>
    `;

    btn.onclick = async () => {
      selectedAsset = a.id;
      selectedAssetMeta = {
        id: a.id,
        asset_code: a.asset_code,
        asset_name: a.asset_name
      };

      if (selectedBtn) selectedBtn.classList.remove("selected");
      btn.classList.add("selected");
      selectedBtn = btn;

      await loadAssetHours(a.id);
      renderSelectedMachineCard();
    };

    div.appendChild(btn);
  });
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") || "";

  let data;
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
}

async function loadAssetHours(assetId) {
  try {
    const data = await fetchJson(`${API}/assets/${assetId}/hours`);
    currentAssetHours = Number(data.total_hours || 0);
    document.getElementById("currentHours").textContent = currentAssetHours.toFixed(1);
    document.getElementById("bdCurrentHours").textContent = currentAssetHours.toFixed(1);
    document.getElementById("bdHoursDown").value = currentAssetHours.toFixed(1);
  } catch (err) {
    console.error(err);
    currentAssetHours = 0;
    document.getElementById("currentHours").textContent = "0.0";
    document.getElementById("bdCurrentHours").textContent = "0.0";
  }
}

async function loadMyMachines() {
  clearMessage();

  const operator = (document.getElementById("operator").value || "").trim();
  const signature = (document.getElementById("operatorSignature").value || "").trim();
  const errBox = document.getElementById("assetsError");

  if (!operator) {
    errBox.textContent = t("msg_enter_operator");
    errBox.style.display = "block";
    renderAssets([]);
    return;
  }

  if (!signature) {
    document.getElementById("operatorSignature").value = operator;
  }

  document.getElementById("bdOperator").value = operator;
  if (!document.getElementById("bdSignature").value.trim()) {
    document.getElementById("bdSignature").value = operator;
  }

  errBox.style.display = "none";

  try {
    const mine = await fetchJson(`${API}/assets/my?operator=${encodeURIComponent(operator)}`);

    if (Array.isArray(mine) && mine.length > 0) {
      renderAssets(mine);
      return;
    }

    errBox.textContent = t("msg_allocated_none");
    errBox.style.display = "block";

    const all = await fetchJson(`${API}/assets`);
    renderAssets(all);
  } catch (e) {
    console.error(e);

    try {
      const all = await fetchJson(`${API}/assets`);
      renderAssets(all);
      errBox.textContent = t("msg_allocated_none");
      errBox.style.display = "block";
    } catch (innerErr) {
      console.error(innerErr);
      errBox.textContent = t("msg_machine_load_fail");
      errBox.style.display = "block";
    }
  }
}

function calculateOverallStatus() {
  const values = Object.values(checklist);
  if (values.includes("unsafe")) return "unsafe";
  if (values.includes("attention")) return "attention";
  return "ok";
}

function renderOverallStatus() {
  const status = calculateOverallStatus();
  const el = document.getElementById("overallStatus");

  el.className = "badge";

  if (status === "unsafe") {
    el.textContent = t("status_label_unsafe");
    el.classList.add("badge-unsafe");
  } else if (status === "attention") {
    el.textContent = t("status_label_attention");
    el.classList.add("badge-attention");
  } else {
    el.textContent = t("status_label_ok");
    el.classList.add("badge-ok");
  }
}

function resetChecklist() {
  Object.keys(checklist).forEach((key) => {
    checklist[key] = "ok";
  });

  document.querySelectorAll(".status-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === "ok");
  });

  renderOverallStatus();
}

function bindChecklistButtons() {
  document.querySelectorAll(".status-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const value = btn.dataset.value;

      checklist[key] = value;

      document.querySelectorAll(`.status-btn[data-key="${key}"]`).forEach((b) => {
        b.classList.remove("active");
      });

      btn.classList.add("active");
      renderOverallStatus();
    });
  });
}

async function submitInspection() {
  if (isSubmittingInspection) return;

  clearMessage();

  const operator_name = (document.getElementById("operator").value || "").trim();
  const operator_signature = (document.getElementById("operatorSignature").value || "").trim();
  const notes = (document.getElementById("notes").value || "").trim();
  const hour_meter_reading = (document.getElementById("hourMeter").value || "").trim();

  if (!operator_name) {
    showMessage(t("msg_enter_operator"), "error");
    return;
  }

  if (!operator_signature) {
    showMessage(t("msg_enter_signature"), "error");
    return;
  }

  if (!selectedAsset) {
    showMessage(t("msg_select_machine"), "error");
    return;
  }

  if (!hour_meter_reading) {
    showMessage(t("msg_enter_hours"), "error");
    return;
  }

  isSubmittingInspection = true;
  const btn = document.getElementById("submitInspectionBtn");
  btn.disabled = true;

  try {
    const data = await fetchJson(`${API}/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_id: selectedAsset,
        operator_name,
        operator_signature,
        notes,
        hour_meter_reading
      })
    });

    let msg = `${t("msg_inspection_saved")} ${t("current_hours")}: ${Number(data.asset_total_hours || 0).toFixed(1)}`;

    if (data.hour_warning) {
      msg += ` | ${t("msg_hours_warning_prefix")}: ${data.hour_warning}`;
    }
    showMessage(msg, "success");
    if (data.station_collision_warning) {
      showCollisionWarning(`${t("msg_hours_warning_prefix")}: ${data.station_collision_warning}`);
    }

    document.getElementById("notes").value = "";
    document.getElementById("hourMeter").value = "";
    resetChecklist();

    await loadAssetHours(selectedAsset);
  } catch (err) {
    console.error(err);
    showMessage(err.message || "Save failed", "error");
  } finally {
    isSubmittingInspection = false;
    btn.disabled = false;
  }
}
async function submitBreakdown() {
  if (isSubmittingBreakdown) return;

  clearMessage();

  const operator_name = (document.getElementById("bdOperator").value || "").trim();
  const operator_signature = (document.getElementById("bdSignature").value || "").trim();
  const component = document.getElementById("bdComponent").value;
  const issue = (document.getElementById("bdIssue").value || "").trim();
  const notes = (document.getElementById("bdNotes").value || "").trim();
  const hour_meter_reading = (document.getElementById("bdHoursDown").value || "").trim();
  if (!operator_name) {
    showMessage(t("msg_enter_operator"), "error");
    return;
  }

  if (!operator_signature) {
    showMessage(t("msg_enter_signature"), "error");
    return;
  }

  if (!selectedAsset) {
    showMessage(t("msg_select_machine"), "error");
    return;
  }

  if (!issue) {
    showMessage(t("msg_breakdown_issue"), "error");
    return;
  }

  isSubmittingBreakdown = true;
  const btn = document.getElementById("submitBreakdownBtn");
  btn.disabled = true;

  try {
    const data = await fetchJson(`${API}/breakdowns/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_id: selectedAsset,
        operator_name,
        operator_signature,
        component,
        issue,
        notes,
        hour_meter_reading
      })
    });

    const machineName = `${data.asset_code || ""} ${data.asset_name || ""}`.trim();
    const msg = `${t("msg_breakdown_saved")} ${t("machine")}: ${machineName} | ${t("breakdown_number")}: ${data.created_breakdown_id} | ${t("work_order_number")}: ${data.created_work_order_id}`;

    showMessage(msg, "success");

    document.getElementById("bdIssue").value = "";
    document.getElementById("bdNotes").value = "";
    document.getElementById("bdTimeDown").textContent = formatNowDisplay();
  } catch (err) {
    console.error(err);
    showMessage(err.message || "Save failed", "error");
  } finally {
    isSubmittingBreakdown = false;
    btn.disabled = false;
  }
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "unsafe") return "status-unsafe";
  if (s === "attention") return "status-attention";
  return "status-ok";
}

async function loadHistory() {
  const operator = (document.getElementById("operator").value || "").trim();
  const list = document.getElementById("historyList");
  list.innerHTML = `<div class="history-empty">${t("msg_loading")}</div>`;

  if (!operator) {
    list.innerHTML = `<div class="history-empty">${t("msg_enter_operator")}</div>`;
    return;
  }

  try {
    const [inspectionRows, breakdownRows] = await Promise.all([
      fetchJson(`${API}/inspections`),
      fetchJson(`${API}/breakdowns/my?operator=${encodeURIComponent(operator)}`)
    ]);

    const mineInspections = Array.isArray(inspectionRows)
      ? inspectionRows.filter((r) => String(r.operator_name || "").toLowerCase() === operator.toLowerCase()).slice(0, 20)
      : [];

    const mineBreakdowns = Array.isArray(breakdownRows) ? breakdownRows.slice(0, 20) : [];

    const inspectionsHtml = mineInspections.length
      ? mineInspections.map((row) => `
          <div class="history-card">
            <div class="history-top">
              <strong>${row.asset_code || ""} ${row.asset_name || ""}</strong>
              <span class="history-status ${statusClass(row.status)}">${String(row.status || "").toUpperCase()}</span>
            </div>
            <div class="history-line"><strong>${t("date")}:</strong> ${row.inspection_date || ""}</div>
            <div class="history-line"><strong>${t("new_hour_reading")}:</strong> ${row.hour_meter_reading ?? "-"}</div>
            <div class="history-line"><strong>${t("inspection_status")}:</strong> ${String(row.status || "").toUpperCase()}</div>
            <div class="history-line"><strong>${t("notes")}:</strong> ${row.notes || "-"}</div>
          </div>
        `).join("")
      : `<div class="history-empty">${t("no_inspection_history")}</div>`;

    const breakdownsHtml = mineBreakdowns.length
      ? mineBreakdowns.map((row) => `
          <div class="history-card breakdown-card">
            <div class="history-top">
              <strong>${row.asset_code || ""} ${row.asset_name || ""}</strong>
              <span class="history-status ${String(row.status || "").toUpperCase() === "OPEN" ? "status-attention" : "status-ok"}">${String(row.status || "").toUpperCase()}</span>
            </div>
            <div class="history-line"><strong>${t("date")}:</strong> ${row.breakdown_date || ""}</div>
            <div class="history-line"><strong>${t("component")}:</strong> ${row.component || "-"}</div>
            <div class="history-line"><strong>${t("issue")}:</strong> ${row.issue || "-"}</div>
            <div class="history-line"><strong>${t("hours_down")}:</strong> ${row.hours_down || "-"}</div>
            <div class="history-line"><strong>${t("breakdown_number")}:</strong> ${row.id || "-"}</div>
            <div class="history-line"><strong>${t("work_order_number")}:</strong> ${row.primary_work_order_id || "-"}</div>
            <div class="history-line"><strong>${t("wo_status")}:</strong> ${row.work_order_status || "-"}</div>
          </div>
        `).join("")
      : `<div class="history-empty">${t("no_breakdown_history")}</div>`;

    list.innerHTML = `
      <div class="history-section">
        <div class="history-section-title">${t("inspection_history")}</div>
        ${inspectionsHtml}
      </div>

      <div class="history-section">
        <div class="history-section-title">${t("breakdown_history")}</div>
        ${breakdownsHtml}
      </div>
    `;
  } catch (err) {
    console.error(err);
    list.innerHTML = `<div class="history-empty">${t("msg_history_load_fail")}</div>`;
  }
}

function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function bindLanguageButtons() {
  document.getElementById("langEn").addEventListener("click", () => applyLanguage("en"));
  document.getElementById("langPt").addEventListener("click", () => applyLanguage("pt"));
}

function bindMainButtons() {
  document.getElementById("reloadMachines").addEventListener("click", loadMyMachines);
  document.getElementById("submitInspectionBtn").addEventListener("click", submitInspection);
  document.getElementById("submitBreakdownBtn").addEventListener("click", submitBreakdown);
  document.getElementById("reloadHistoryBtn").addEventListener("click", loadHistory);

  document.getElementById("operator").addEventListener("blur", () => {
    const operator = document.getElementById("operator").value.trim();
    if (operator && !document.getElementById("operatorSignature").value.trim()) {
      document.getElementById("operatorSignature").value = operator;
    }
  });

  document.getElementById("bdOperator").addEventListener("blur", () => {
    const operator = document.getElementById("bdOperator").value.trim();
    if (operator && !document.getElementById("bdSignature").value.trim()) {
      document.getElementById("bdSignature").value = operator;
    }
  });
}

setDates();
bindTabs();
bindLanguageButtons();
bindChecklistButtons();
bindMainButtons();
resetChecklist();
applyLanguage("en");
renderSelectedMachineCard();