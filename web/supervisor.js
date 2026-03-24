const API = "/api";
let selectedApproval = null;

function supervisorShowMessage(text, type = "info") {
  const box = document.getElementById("supervisorMessageBox");
  box.textContent = text;
  box.className = `message-box ${type}`;
  box.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function supervisorClearMessage() {
  const box = document.getElementById("supervisorMessageBox");
  box.style.display = "none";
  box.textContent = "";
}

async function supervisorFetchJson(url, options) {
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

function renderSelectedApprovalCard() {
  const card = document.getElementById("selectedApprovalCard");

  if (!selectedApproval) {
    card.className = "selected-machine-card empty";
    card.innerHTML = `
      <div class="selected-machine-title">No work order selected</div>
      <div class="selected-machine-sub">Select a completed work order first.</div>
    `;
    return;
  }

  card.className = "selected-machine-card";
  card.innerHTML = `
    <div class="selected-machine-code">WO #${selectedApproval.id}</div>
    <div class="selected-machine-title">${selectedApproval.asset_code || ""} ${selectedApproval.asset_name || ""}</div>
    <div class="selected-machine-sub">Component: ${selectedApproval.breakdown_component || "-"}</div>
    <div class="selected-machine-sub">Issue: ${selectedApproval.issue || "-"}</div>
    <div class="selected-machine-sub">Artisan: ${selectedApproval.artisan_name || "-"}</div>
    <div class="selected-machine-sub">Work Done: ${selectedApproval.work_done || "-"}</div>
    <div class="selected-machine-sub">Time Down: ${selectedApproval.time_down || "-"}</div>
  `;
}

async function loadSupervisorApprovals() {
  const list = document.getElementById("supervisorApprovalsList");
  list.innerHTML = `<div class="history-empty">Loading...</div>`;

  try {
    const rows = await supervisorFetchJson(`${API}/supervisor/approvals`);

    if (!rows.length) {
      list.innerHTML = `<div class="history-empty">No work orders awaiting approval.</div>`;
      return;
    }

    list.innerHTML = rows.map((row) => `
      <div class="history-card">
        <div class="history-top">
          <strong>WO #${row.id}</strong>
          <span class="history-status status-attention">${String(row.status || "").toUpperCase()}</span>
        </div>
        <div class="history-line"><strong>Machine:</strong> ${row.asset_code || ""} ${row.asset_name || ""}</div>
        <div class="history-line"><strong>Component:</strong> ${row.breakdown_component || "-"}</div>
        <div class="history-line"><strong>Issue:</strong> ${row.issue || "-"}</div>
        <div class="history-line"><strong>Artisan:</strong> ${row.artisan_name || "-"}</div>
        <div class="history-line"><strong>Work Done:</strong> ${row.work_done || "-"}</div>
        <button type="button" class="secondary-btn supervisor-select-btn" data-id="${row.id}">Select</button>
      </div>
    `).join("");

    document.querySelectorAll(".supervisor-select-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        selectedApproval = rows.find((r) => Number(r.id) === id) || null;
        renderSelectedApprovalCard();
      });
    });
  } catch (err) {
    console.error(err);
    list.innerHTML = `<div class="history-empty">Failed to load approvals: ${err.message}</div>`;
  }
}

async function approveSelectedWorkOrder() {
  const supervisor_name = (document.getElementById("supervisorName").value || "").trim();
  const supervisor_notes = (document.getElementById("supervisorNotes").value || "").trim();

  if (!selectedApproval) {
    supervisorShowMessage("Select a work order first.", "error");
    return;
  }

  if (!supervisor_name) {
    supervisorShowMessage("Enter supervisor name first.", "error");
    return;
  }

  try {
    const data = await supervisorFetchJson(`${API}/supervisor/approvals/${selectedApproval.id}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        supervisor_name,
        supervisor_notes
      })
    });

    supervisorShowMessage(`Work order ${data.work_order_id} approved and closed.`, "success");
    selectedApproval = null;
    document.getElementById("supervisorNotes").value = "";
    renderSelectedApprovalCard();
    loadSupervisorApprovals();
  } catch (err) {
    console.error(err);
    supervisorShowMessage(err.message || "Approval failed.", "error");
  }
}

async function rejectSelectedWorkOrder() {
  const supervisor_name = (document.getElementById("supervisorName").value || "").trim();
  const supervisor_notes = (document.getElementById("supervisorNotes").value || "").trim();

  if (!selectedApproval) {
    supervisorShowMessage("Select a work order first.", "error");
    return;
  }

  if (!supervisor_name) {
    supervisorShowMessage("Enter supervisor name first.", "error");
    return;
  }

  if (!supervisor_notes) {
    supervisorShowMessage("Enter rejection notes first.", "error");
    return;
  }

  try {
    const data = await supervisorFetchJson(`${API}/supervisor/approvals/${selectedApproval.id}/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        supervisor_name,
        supervisor_notes
      })
    });

    supervisorShowMessage(`Work order ${data.work_order_id} rejected and returned to in progress.`, "success");
    selectedApproval = null;
    document.getElementById("supervisorNotes").value = "";
    renderSelectedApprovalCard();
    loadSupervisorApprovals();
  } catch (err) {
    console.error(err);
    supervisorShowMessage(err.message || "Rejection failed.", "error");
  }
}

document.getElementById("reloadApprovalsBtn").addEventListener("click", loadSupervisorApprovals);
document.getElementById("approveWorkOrderBtn").addEventListener("click", approveSelectedWorkOrder);
document.getElementById("rejectWorkOrderBtn").addEventListener("click", rejectSelectedWorkOrder);

renderSelectedApprovalCard();
loadSupervisorApprovals();