const API = "/api";

let artisanSelectedAsset = null;
let artisanSelectedBtn = null;
let artisanCurrentHours = 0;
let artisanSubmitting = false;
let selectedWorkOrder = null;

const artisanChecklist = {
  engine: "ok",
  hydraulics: "ok",
  leaks: "ok",
  lights: "ok",
  brakes: "ok",
  safety_equipment: "ok",
  tyres: "ok",
  fluids: "ok",
  other: "ok"
};

function artisanShowMessage(text, type = "info") {
  const box = document.getElementById("artisanMessageBox");
  box.textContent = text;
  box.className = `message-box ${type}`;
  box.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function artisanClearMessage() {
  const box = document.getElementById("artisanMessageBox");
  box.style.display = "none";
  box.textContent = "";
}

function artisanSetDate() {
  document.getElementById("artisanDate").value = new Date().toISOString().slice(0, 10);
}

function artisanSwitchTab(tabName) {
  document.querySelectorAll("#artisanTabBtnInspection, #artisanTabBtnMaintenance, #artisanTabBtnWorkOrders").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  document.querySelectorAll("#artisan-tab-inspection, #artisan-tab-maintenance, #artisan-tab-workorders").forEach((panel) => {
    panel.classList.remove("active");
  });

  document.getElementById(`artisan-tab-${tabName}`).classList.add("active");

  if (tabName === "workorders") {
    loadArtisanWorkOrders();
  }
}

async function artisanFetchJson(url, options) {
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

function artisanRenderAssets(assets) {
  const div = document.getElementById("artisanAssets");
  div.innerHTML = "";
  artisanSelectedAsset = null;
  artisanCurrentHours = 0;
  document.getElementById("artisanCurrentHours").textContent = "0.0";

  if (artisanSelectedBtn) artisanSelectedBtn.classList.remove("selected");
  artisanSelectedBtn = null;

  assets.forEach((a) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "machine-card";
    btn.innerHTML = `
      <span class="machine-code">${a.asset_code || ""}</span>
      <span class="machine-name">${a.asset_name || ""}</span>
    `;

    btn.onclick = async () => {
      artisanSelectedAsset = a.id;

      if (artisanSelectedBtn) artisanSelectedBtn.classList.remove("selected");
      btn.classList.add("selected");
      artisanSelectedBtn = btn;

      await artisanLoadAssetHours(a.id);
    };

    div.appendChild(btn);
  });
}

async function artisanLoadMachines() {
  artisanClearMessage();

  const artisanName = (document.getElementById("artisanName").value || "").trim();
  const errBox = document.getElementById("artisanAssetsError");

  if (!artisanName) {
    errBox.textContent = "Please enter artisan name first.";
    errBox.style.display = "block";
    artisanRenderAssets([]);
    return;
  }

  const signature = document.getElementById("artisanSignature");
  if (!signature.value.trim()) {
    signature.value = artisanName;
  }

  errBox.style.display = "none";

  try {
    const all = await artisanFetchJson(`${API}/assets`);
    artisanRenderAssets(all);
  } catch (err) {
    console.error(err);
    errBox.textContent = "Failed to load machines.";
    errBox.style.display = "block";
  }
}

async function artisanLoadAssetHours(assetId) {
  try {
    const data = await artisanFetchJson(`${API}/assets/${assetId}/hours`);
    artisanCurrentHours = Number(data.total_hours || 0);
    document.getElementById("artisanCurrentHours").textContent = artisanCurrentHours.toFixed(1);
    document.getElementById("artisanHourMeter").value = artisanCurrentHours.toFixed(1);
    document.getElementById("maintHours").value = artisanCurrentHours.toFixed(1);
  } catch (err) {
    console.error(err);
    artisanCurrentHours = 0;
    document.getElementById("artisanCurrentHours").textContent = "0.0";
  }
}

function artisanBindChecklistButtons() {
  const buttons = document.querySelectorAll(".artisan-status-btn");

  console.log("Artisan checklist buttons found:", buttons.length);

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const value = btn.dataset.value;

      if (!key || !value) return;

      artisanChecklist[key] = value;

      document.querySelectorAll(`.artisan-status-btn[data-key="${key}"]`).forEach((b) => {
        b.classList.remove("active");
      });

      btn.classList.add("active");

      const otherWrap = document.getElementById("artisanOtherCommentWrap");
      if (key === "other") {
        if (value !== "ok") {
          otherWrap.style.display = "block";
        } else {
          otherWrap.style.display = "none";
          document.getElementById("artisanOtherComment").value = "";
        }
      }
    });
  });
}

async function artisanSubmitInspection() {
  if (artisanSubmitting) return;

  artisanClearMessage();

  const artisan_name = (document.getElementById("artisanName").value || "").trim();
  const artisan_signature = (document.getElementById("artisanSignature").value || "").trim();
  const other_comment = (document.getElementById("artisanOtherComment").value || "").trim();
  const lube_type = (document.getElementById("artisanLubeType").value || "").trim();
  const lube_qty = (document.getElementById("artisanLubeQty").value || "").trim();
  const notes = (document.getElementById("artisanNotes").value || "").trim();
  const hour_meter_reading = (document.getElementById("artisanHourMeter").value || "").trim();

  if (!artisan_name) {
    artisanShowMessage("Please enter artisan name.", "error");
    return;
  }

  if (!artisan_signature) {
    artisanShowMessage("Please type artisan signature.", "error");
    return;
  }

  if (!artisanSelectedAsset) {
    artisanShowMessage("Please select a machine.", "error");
    return;
  }

  artisanSubmitting = true;
  const btn = document.getElementById("artisanSubmitInspectionBtn");
  btn.disabled = true;

  try {
    const data = await artisanFetchJson(`${API}/artisan/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_id: artisanSelectedAsset,
        artisan_name,
        artisan_signature,
        checklist: artisanChecklist,
        other_comment,
        lube_type,
        lube_qty,
        notes,
        hour_meter_reading
      })
    });

    artisanShowMessage(
      `Artisan inspection saved successfully. Machine: ${data.asset_code} ${data.asset_name}`,
      "success"
    );
    alert("Inspection submitted successfully");

    artisanChecklist = {};
document.querySelectorAll(".artisan-status-btn").forEach((btn) => {
  if (btn.dataset.value === "ok") {
    btn.classList.add("active");
  } else {
    btn.classList.remove("active");
  }
});
   /// document.getElementById("artisanOtherComment").value = "";
   /// document.getElementById("artisanLubeType").value = "";
   /// document.getElementById("artisanLubeQty").value = "";
   /// document.getElementById("artisanNotes").value = "";

    Object.keys(artisanChecklist).forEach((key) => {
      artisanChecklist[key] = "ok";
    });

    document.querySelectorAll(".artisan-status-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.value === "ok");
    });

    document.getElementById("artisanOtherCommentWrap").style.display = "none";
  } catch (err) {
    console.error(err);
    artisanShowMessage(err.message || "Save failed.", "error");
  } finally {
    artisanSubmitting = false;
    btn.disabled = false;
  }
}

function addLubeRow() {
  const wrap = document.getElementById("maintLubesWrap");
  const row = document.createElement("div");
  row.className = "multi-row maint-lube-row";
  row.innerHTML = `
    <input class="maintLubeType" placeholder="Lube type e.g. 15W40" />
    <input class="maintLubeQty" type="number" step="0.1" min="0" placeholder="Qty" />
    <button type="button" class="secondary-btn remove-row-btn">Remove</button>
  `;
  wrap.appendChild(row);
  bindRemoveRowButtons();
}

function addPartRow() {
  const wrap = document.getElementById("maintPartsWrap");
  const row = document.createElement("div");
  row.className = "multi-row maint-part-row";
  row.innerHTML = `
    <input class="maintPartName" placeholder="Part name" />
    <input class="maintPartQty" type="number" step="1" min="0" placeholder="Qty" />
    <button type="button" class="secondary-btn remove-row-btn">Remove</button>
  `;
  wrap.appendChild(row);
  bindRemoveRowButtons();
}

function bindRemoveRowButtons() {
  document.querySelectorAll(".remove-row-btn").forEach((btn) => {
    btn.onclick = () => {
      const row = btn.closest(".multi-row");
      const parent = row.parentElement;

      // keep at least one row in each section
      if (
        (parent.id === "maintLubesWrap" && parent.querySelectorAll(".maint-lube-row").length === 1) ||
        (parent.id === "maintPartsWrap" && parent.querySelectorAll(".maint-part-row").length === 1)
      ) {
        row.querySelectorAll("input").forEach((input) => {
          input.value = "";
        });
        return;
      }

      row.remove();
    };
  });
}

async function submitMaintenance() {
  const artisan_name = document.getElementById("artisanName").value.trim();
  const artisan_signature = document.getElementById("artisanSignature").value.trim();

  if (!artisanSelectedAsset) {
    artisanShowMessage("Select machine first", "error");
    return;
  }

  if (!artisan_name) {
    artisanShowMessage("Please enter artisan name.", "error");
    return;
  }

  if (!artisan_signature) {
    artisanShowMessage("Please type artisan signature.", "error");
    return;
  }

  const lubes = Array.from(document.querySelectorAll(".maint-lube-row"))
    .map((row) => ({
      type: row.querySelector(".maintLubeType")?.value.trim() || "",
      qty: row.querySelector(".maintLubeQty")?.value || ""
    }))
    .filter((item) => item.type || item.qty);

  const parts = Array.from(document.querySelectorAll(".maint-part-row"))
    .map((row) => ({
      name: row.querySelector(".maintPartName")?.value.trim() || "",
      qty: row.querySelector(".maintPartQty")?.value || ""
    }))
    .filter((item) => item.name || item.qty);

  try {
    const data = await artisanFetchJson("/api/artisan/maintenance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        asset_id: artisanSelectedAsset,
        artisan_name,
        artisan_signature,
        maintenance_type: document.getElementById("maintType").value,
        service_type: document.getElementById("maintServiceType").value,
        hour_meter_reading: document.getElementById("maintHours").value,
        notes: document.getElementById("maintNotes").value,
        lubes,
        parts,
        changes: [{
          type: document.getElementById("maintType").value,
          description: document.getElementById("maintChangeDesc").value,
          qty: document.getElementById("maintChangeQty").value
        }]
      })
    });

    artisanShowMessage(`Maintenance saved. ID: ${data.maintenance_record_id}`, "success");

    document.getElementById("maintServiceType").value = "";
    document.getElementById("maintNotes").value = "";
    document.getElementById("maintChangeDesc").value = "";
    document.getElementById("maintChangeQty").value = "";

    document.querySelectorAll(".maint-lube-row").forEach((row, index) => {
      if (index === 0) {
        row.querySelector(".maintLubeType").value = "";
        row.querySelector(".maintLubeQty").value = "";
      } else {
        row.remove();
      }
    });

    document.querySelectorAll(".maint-part-row").forEach((row, index) => {
      if (index === 0) {
        row.querySelector(".maintPartName").value = "";
        row.querySelector(".maintPartQty").value = "";
      } else {
        row.remove();
      }
    });

    bindRemoveRowButtons();
  } catch (err) {
    artisanShowMessage(err.message, "error");
  }
}

function renderSelectedWorkOrderCard() {
  const card = document.getElementById("selectedWorkOrderCard");

  if (!selectedWorkOrder) {
    card.className = "selected-machine-card empty";
    card.innerHTML = `
      <div class="selected-machine-title">No work order selected</div>
      <div class="selected-machine-sub">Select an open work order first.</div>
    `;
    return;
  }

  card.className = "selected-machine-card";
  card.innerHTML = `
    <div class="selected-machine-code">WO #${selectedWorkOrder.id}</div>
    <div class="selected-machine-title">${selectedWorkOrder.asset_code || ""} ${selectedWorkOrder.asset_name || ""}</div>
    <div class="selected-machine-sub">Source: ${selectedWorkOrder.source || "-"} | Status: ${selectedWorkOrder.status || "-"}</div>
    <div class="selected-machine-sub">Component: ${selectedWorkOrder.breakdown_component || "-"}</div>
    <div class="selected-machine-sub">Issue: ${selectedWorkOrder.issue || "-"}</div>
    <div class="selected-machine-sub">Time Down: ${selectedWorkOrder.time_down || "-"}</div>
  `;
}

async function loadArtisanWorkOrders() {
  const list = document.getElementById("artisanWorkOrdersList");
  list.innerHTML = `<div class="history-empty">Loading...</div>`;

  try {
    const rows = await artisanFetchJson(`${API}/artisan/workorders`);

    if (!rows.length) {
      list.innerHTML = `<div class="history-empty">Failed to load work orders: ${err.message}</div>`;
      return;
    }

   list.innerHTML = rows.map((row) => `
  <div class="history-card">
    <div class="history-top">
      <strong>WO #${row.id}</strong>
      <span class="history-status status-attention">${String(row.status || "").toUpperCase()}</span>
    </div>
    <div class="history-line"><strong>Machine:</strong> ${row.asset_code || ""} ${row.asset_name || ""}</div>
    <div class="history-line"><strong>Source:</strong> ${row.source || "-"}</div>
    <div class="history-line"><strong>Component:</strong> ${row.breakdown_component || "-"}</div>
    <div class="history-line"><strong>Issue:</strong> ${row.issue || "-"}</div>
    <div class="history-line"><strong>Time Down:</strong> ${row.time_down || "-"}</div>
    <div class="history-line"><strong>Opened:</strong> ${row.opened_at || "-"}</div>
    <button type="button" class="secondary-btn artisan-wo-select-btn" data-id="${row.id}">Select Work Order</button>
  </div>
`).join("");

    document.querySelectorAll(".artisan-wo-select-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        selectedWorkOrder = rows.find((r) => Number(r.id) === id) || null;
        renderSelectedWorkOrderCard();
      });
    });
  } catch (err) {
    console.error(err);
    list.innerHTML = `<div class="history-empty">Failed to load work orders.</div>`;
  }
}

async function completeSelectedWorkOrder() {
  const artisan_name = (document.getElementById("artisanName").value || "").trim();
const artisan_signature = (document.getElementById("artisanSignature").value || "").trim();
const work_done_notes = (document.getElementById("woWorkDoneNotes").value || "").trim();
const beforeFiles = document.getElementById("woBeforePhotos").files;
const afterFiles = document.getElementById("woAfterPhotos").files;
  if (!selectedWorkOrder) {
    artisanShowMessage("Select a work order first.", "error");
    return;
  }

  if (!artisan_name) {
    artisanShowMessage("Please enter artisan name.", "error");
    return;
  }

  if (!artisan_signature) {
    artisanShowMessage("Please type artisan signature.", "error");
    return;
  }

  if (!work_done_notes) {
    artisanShowMessage("Please enter work done notes.", "error");
    return;
  }

  const before_photos = await readFilesAsDataUrls(beforeFiles);
const after_photos = await readFilesAsDataUrls(afterFiles);
  try {
    const data = await artisanFetchJson(`${API}/artisan/workorders/${selectedWorkOrder.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
  artisan_name,
  artisan_signature,
  work_done_notes,
  before_photos,
  after_photos
})
    });

    artisanShowMessage(`Work order ${data.work_order_id} marked completed by artisan.`, "success");
    document.getElementById("woWorkDoneNotes").value = "";
    selectedWorkOrder = null;
    renderSelectedWorkOrderCard();
    loadArtisanWorkOrders();
  } catch (err) {
    console.error(err);
    artisanShowMessage(err.message || "Failed to complete work order.", "error");
  }
}

function artisanBindTabs() {
  document.querySelectorAll("#artisanTabBtnInspection, #artisanTabBtnMaintenance, #artisanTabBtnWorkOrders").forEach((btn) => {
    btn.addEventListener("click", () => artisanSwitchTab(btn.dataset.tab));
  });
}

function artisanBindMainButtons() {
  document.getElementById("artisanLoadMachines").addEventListener("click", artisanLoadMachines);
  document.getElementById("artisanSubmitInspectionBtn").addEventListener("click", artisanSubmitInspection);
  document.getElementById("submitMaintenance").addEventListener("click", submitMaintenance);
  document.getElementById("reloadWorkOrdersBtn").addEventListener("click", loadArtisanWorkOrders);
  document.getElementById("completeWorkOrderBtn").addEventListener("click", completeSelectedWorkOrder);
  document.getElementById("addLubeRowBtn").addEventListener("click", addLubeRow);
  document.getElementById("addPartRowBtn").addEventListener("click", addPartRow);
  document.getElementById("woBeforePhotos").value = "";
document.getElementById("woAfterPhotos").value = "";

  document.getElementById("artisanName").addEventListener("blur", () => {
    const name = document.getElementById("artisanName").value.trim();
    if (name && !document.getElementById("artisanSignature").value.trim()) {
      document.getElementById("artisanSignature").value = name;
    }
  });
}

artisanSetDate();
artisanBindTabs();
artisanBindChecklistButtons();
artisanBindMainButtons();
renderSelectedWorkOrderCard();
bindRemoveRowButtons();