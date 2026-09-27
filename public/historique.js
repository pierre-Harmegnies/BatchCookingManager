import { setupThemeToggle, formatMinutes, renderScheduleTable } from "./shared.js";

setupThemeToggle();

const sessionListEl = document.getElementById("session-list");
const detailSectionEl = document.getElementById("session-detail-section");
const detailTitleEl = document.getElementById("session-detail-title");
const detailMakespanEl = document.getElementById("session-detail-makespan");
const detailTableBody = document.querySelector("#session-schedule-table tbody");
const pdfLinkEl = document.getElementById("session-pdf-link");
const deleteBtn = document.getElementById("session-delete-btn");
let currentSessionId = null;

async function init() {
  const res = await fetch("/api/sessions");
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
  currentSessionId = session.id;

  detailTitleEl.textContent = session.name;
  renderScheduleTable(session.schedule, detailTableBody, detailMakespanEl);
  pdfLinkEl.href = `/api/sessions/${session.id}/pdf`;
  detailSectionEl.hidden = false;
  detailSectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
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

init();
