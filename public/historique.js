import { setupThemeToggle, formatMinutes, renderScheduleTable, fetchEquipmentList } from "./shared.js";

setupThemeToggle();

const sessionListEl = document.getElementById("session-list");
const detailSectionEl = document.getElementById("session-detail-section");
const detailTitleEl = document.getElementById("session-detail-title");
const detailMakespanEl = document.getElementById("session-detail-makespan");
const detailTableEl = document.getElementById("session-schedule-table");
const detailTableBody = document.querySelector("#session-schedule-table tbody");
const pdfLinkEl = document.getElementById("session-pdf-link");
const deleteBtn = document.getElementById("session-delete-btn");

const editBtn = document.getElementById("session-edit-btn");
const editWrapEl = document.getElementById("session-edit-wrap");
const editListEl = document.getElementById("session-edit-list");
const addStepBtn = document.getElementById("session-add-step-btn");
const saveEditBtn = document.getElementById("session-save-edit-btn");
const cancelEditBtn = document.getElementById("session-cancel-edit-btn");
const editStatusEl = document.getElementById("session-edit-status");

let currentSessionId = null;
let equipmentList = [];
let editRows = [];

async function init() {
  const [res, equipment] = await Promise.all([fetch("/api/sessions"), fetchEquipmentList()]);
  equipmentList = equipment;
  const sessions = await res.json();
  renderSessionList(sessions);
}

function renderSessionList(sessions) {
  sessionListEl.innerHTML = "";
  if (sessions.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Aucune session sauvegardée pour l'instant. Génère un planning puis clique \"Sauvegarder cette session\".";
    sessionListEl.append(p);
    return;
  }

  for (const session of sessions) {
    const card = document.createElement("div");
    card.className = "session-card";

    const info = document.createElement("div");
    info.className = "session-card-info";
    const name = document.createElement("strong");
    name.textContent = session.name;
    const meta = document.createElement("span");
    const date = new Date(session.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    meta.textContent = `${date} — ${session.recipeTitles.join(", ")} — ${formatMinutes(session.makespanMinutes)}`;
    info.append(name, meta);

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "secondary";
    viewBtn.textContent = "Voir";
    viewBtn.addEventListener("click", () => loadSessionDetail(session.id));

    card.append(info, viewBtn);
    sessionListEl.append(card);
  }
}

async function loadSessionDetail(id) {
  const res = await fetch(`/api/sessions/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    alert(`Erreur: ${err.error}`);
    return;
  }
  const session = await res.json();
  applySession(session);
  exitEditMode();
  detailSectionEl.hidden = false;
  detailSectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function applySession(session) {
  currentSessionId = session.id;
  detailTitleEl.textContent = session.name;
  renderScheduleTable(session.schedule, detailTableBody, detailMakespanEl);
  pdfLinkEl.href = `/api/sessions/${session.id}/pdf`;
}

deleteBtn.addEventListener("click", async () => {
  if (!currentSessionId) return;
  if (!confirm("Supprimer définitivement cette session sauvegardée ?")) return;

  const res = await fetch(`/api/sessions/${currentSessionId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    alert(`Erreur: ${err.error}`);
    return;
  }
  currentSessionId = null;
  detailSectionEl.hidden = true;
  init();
});

// --- Édition du planning d'une session (local à cette session uniquement) ---

function exitEditMode() {
  editWrapEl.hidden = true;
  detailTableEl.hidden = false;
  editListEl.innerHTML = "";
  editRows = [];
  editStatusEl.textContent = "";
}

editBtn.addEventListener("click", async () => {
  const res = await fetch(`/api/sessions/${currentSessionId}`);
  const session = await res.json();
  editListEl.innerHTML = "";
  editRows = session.schedule.steps.map((step) => createEditStepRow(step));
  for (const row of editRows) editListEl.append(row.element);
  detailTableEl.hidden = true;
  editWrapEl.hidden = false;
});

cancelEditBtn.addEventListener("click", exitEditMode);

addStepBtn.addEventListener("click", () => {
  const lastEnd = editRows.reduce((max, r) => Math.max(max, r.getData().endMinutes), 0);
  const row = createEditStepRow({
    recipeTitle: "Personnalisé",
    description: "",
    startMinutes: lastEnd,
    endMinutes: lastEnd + 5,
    equipmentIds: [],
  });
  editRows.push(row);
  editListEl.append(row.element);
});

saveEditBtn.addEventListener("click", async () => {
  const steps = editRows.map((r) => r.getData());
  const invalid = steps.find((s) => !s.recipeTitle.trim() || !s.description.trim() || s.endMinutes < s.startMinutes);
  if (invalid) {
    editStatusEl.textContent = "Chaque étape a besoin d'une recette, d'une description, et d'une fin ≥ début.";
    return;
  }
  saveEditBtn.disabled = true;
  editStatusEl.textContent = "";
  try {
    const res = await fetch(`/api/sessions/${currentSessionId}/schedule`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error);
    }
    const session = await res.json();
    applySession(session);
    exitEditMode();
  } catch (err) {
    editStatusEl.textContent = `Échec de l'enregistrement : ${err.message}`;
  } finally {
    saveEditBtn.disabled = false;
  }
});

function createEditStepRow(step) {
  const row = document.createElement("div");
  row.className = "edit-step-row";

  const startInput = document.createElement("input");
  startInput.type = "number";
  startInput.min = "0";
  startInput.placeholder = "Début (min)";
  startInput.value = step.startMinutes;

  const endInput = document.createElement("input");
  endInput.type = "number";
  endInput.min = "0";
  endInput.placeholder = "Fin (min)";
  endInput.value = step.endMinutes;

  const recipeInput = document.createElement("input");
  recipeInput.type = "text";
  recipeInput.dataset.role = "recipe";
  recipeInput.placeholder = "Recette";
  recipeInput.value = step.recipeTitle;

  const descInput = document.createElement("input");
  descInput.type = "text";
  descInput.dataset.role = "description";
  descInput.placeholder = "Description de l'étape";
  descInput.value = step.description;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "secondary";
  removeBtn.textContent = "Retirer";
  removeBtn.addEventListener("click", () => {
    row.remove();
    editRows.splice(editRows.indexOf(rowData), 1);
  });

  const top = document.createElement("div");
  top.className = "edit-step-row-top";
  top.append(startInput, endInput, recipeInput, descInput, removeBtn);

  const eqWrap = document.createElement("div");
  eqWrap.className = "equipment-options";
  const eqBoxes = {};
  for (const eq of equipmentList) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = eq.id;
    cb.checked = step.equipmentIds.includes(eq.id);
    eqBoxes[eq.id] = cb;
    label.append(cb, document.createTextNode(eq.name));
    eqWrap.append(label);
  }

  const bottom = document.createElement("div");
  bottom.className = "edit-step-row-bottom";
  bottom.append(eqWrap);

  row.append(top, bottom);

  const rowData = {
    element: row,
    getData: () => ({
      recipeTitle: recipeInput.value,
      description: descInput.value,
      startMinutes: Number(startInput.value) || 0,
      endMinutes: Number(endInput.value) || 0,
      equipmentIds: Object.keys(eqBoxes).filter((id) => eqBoxes[id].checked),
    }),
  };
  return rowData;
}

init();
