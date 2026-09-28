import { setupThemeToggle, fetchEquipmentList, createStepEditorCard, renderScheduleTable } from "./shared.js";

setupThemeToggle();

const MAX_SELECTION = 4;
const selectedSlugs = new Set();
let allRecipes = [];
let equipmentList = [];

const menuListEl = document.getElementById("menu-list");
const recipeListEl = document.getElementById("recipe-list");
const recipeSearchEl = document.getElementById("recipe-search");
const generateBtn = document.getElementById("generate-btn");
const selectionCountEl = document.getElementById("selection-count");
const missingSectionEl = document.getElementById("missing-section");
const missingListEl = document.getElementById("missing-list");
const retryBtn = document.getElementById("retry-btn");
const scheduleSectionEl = document.getElementById("schedule-section");
const scheduleTableBody = document.querySelector("#schedule-table tbody");
const makespanEl = document.getElementById("makespan");
const sessionNameInput = document.getElementById("session-name-input");
const saveSessionBtn = document.getElementById("save-session-btn");
const saveSessionStatusEl = document.getElementById("save-session-status");
const suggestMissingBtn = document.getElementById("suggest-missing-btn");
const suggestMissingStatusEl = document.getElementById("suggest-missing-status");
let currentSlugs = [];
let currentMissingCards = [];
let currentMissingSteps = [];

async function init() {
  const [recipesRes, equipment, menusRes] = await Promise.all([
    fetch("/api/recipes"),
    fetchEquipmentList(),
    fetch("/api/menus"),
  ]);
  allRecipes = await recipesRes.json();
  equipmentList = equipment;
  renderRecipeList(allRecipes);
  renderMenuList(await menusRes.json());
}

function renderMenuList(menus) {
  menuListEl.innerHTML = "";
  const withRecipes = menus.filter((m) => m.recipes.length > 0);
  if (withRecipes.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Aucun menu avec des recettes trouvé dans MaCuisine.";
    menuListEl.append(li);
    return;
  }
  for (const menu of withRecipes) {
    const li = document.createElement("li");
    const info = document.createElement("div");
    info.className = "menu-info";
    const name = document.createElement("strong");
    name.textContent = menu.name;
    const detail = document.createElement("span");
    detail.textContent = `${menu.recipes.length} recette(s)${menu.weekStart ? " — semaine du " + menu.weekStart : ""}`;
    info.append(name, detail);

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.textContent = "Charger";
    loadBtn.addEventListener("click", () => applyMenuSelection(menu));

    li.append(info, loadBtn);
    menuListEl.append(li);
  }
}

function applyMenuSelection(menu) {
  selectedSlugs.clear();
  const toSelect = menu.recipes.slice(0, MAX_SELECTION);
  for (const recipe of toSelect) selectedSlugs.add(recipe.slug);

  if (menu.recipes.length > MAX_SELECTION) {
    alert(
      `Ce menu contient ${menu.recipes.length} recettes, seules les ${MAX_SELECTION} premières ont été cochées. Ajuste la sélection ci-dessous si besoin.`,
    );
  }

  recipeSearchEl.value = "";
  renderRecipeList(allRecipes);
  selectionCountEl.textContent = `${selectedSlugs.size} / ${MAX_SELECTION} sélectionnée(s)`;
  generateBtn.disabled = selectedSlugs.size === 0;
}

function renderRecipeList(recipes) {
  recipeListEl.innerHTML = "";
  for (const recipe of recipes) {
    const li = document.createElement("li");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedSlugs.has(recipe.slug);
    checkbox.addEventListener("change", () => toggleSelection(recipe.slug, checkbox));
    const label = document.createElement("span");
    label.textContent = recipe.title;
    li.append(checkbox, label);
    recipeListEl.append(li);
  }
}

function toggleSelection(slug, checkbox) {
  if (checkbox.checked) {
    if (selectedSlugs.size >= MAX_SELECTION) {
      checkbox.checked = false;
      alert(`Maximum ${MAX_SELECTION} menus par semaine.`);
      return;
    }
    selectedSlugs.add(slug);
  } else {
    selectedSlugs.delete(slug);
  }
  selectionCountEl.textContent = `${selectedSlugs.size} / ${MAX_SELECTION} sélectionnée(s)`;
  generateBtn.disabled = selectedSlugs.size === 0;
}

recipeSearchEl.addEventListener("input", () => {
  const q = recipeSearchEl.value.trim().toLowerCase();
  const filtered = q ? allRecipes.filter((r) => r.title.toLowerCase().includes(q)) : allRecipes;
  renderRecipeList(filtered);
});

generateBtn.addEventListener("click", loadPlanning);
retryBtn.addEventListener("click", loadPlanning);

async function loadPlanning() {
  const slugs = [...selectedSlugs].join(",");
  const res = await fetch(`/api/planning?slugs=${encodeURIComponent(slugs)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    alert(`Erreur: ${err.error}`);
    return;
  }
  const data = await res.json();

  if (data.missingSteps.length > 0) {
    missingListEl.innerHTML = "";
    suggestMissingStatusEl.textContent = "";
    currentMissingSteps = data.missingSteps;
    currentMissingCards = data.missingSteps.map((step) => {
      const card = createStepEditorCard(step, null, equipmentList);
      missingListEl.append(card.element);
      return card;
    });
    missingSectionEl.hidden = false;
    scheduleSectionEl.hidden = true;
  } else {
    missingSectionEl.hidden = true;
    currentSlugs = [...selectedSlugs];
    renderScheduleTable(data.schedule, scheduleTableBody, makespanEl);
    document.getElementById("pdf-link").href = `/api/planning/pdf?slugs=${encodeURIComponent(slugs)}`;
    saveSessionStatusEl.textContent = "";
    scheduleSectionEl.hidden = false;
  }
}

suggestMissingBtn.addEventListener("click", async () => {
  if (currentMissingSteps.length === 0) return;
  suggestMissingBtn.disabled = true;
  suggestMissingStatusEl.textContent = "Suggestion en cours...";
  try {
    // Un appel par recette (pas par étape) : la suggestion groupée voit toute
    // la recette, ce qui lui permet de repérer les réservations d'équipement
    // implicites (ex: un appareil encore occupé par une cuisson précédente).
    const slugsInvolved = [...new Set(currentMissingSteps.map((s) => s.recipeSlug))];
    let appliedCount = 0;

    for (const slug of slugsInvolved) {
      const res = await fetch(`/api/recipes/${encodeURIComponent(slug)}/suggest-all`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error);
      }
      const { suggestions } = await res.json();
      for (const card of currentMissingCards) {
        const suggestion = suggestions[card.stepId];
        if (suggestion) {
          card.applySuggestion(suggestion);
          appliedCount++;
        }
      }
    }

    suggestMissingStatusEl.textContent = `Suggestions appliquées pour ${appliedCount} étape(s) — vérifie chaque étape avant d'enregistrer.`;
  } catch (err) {
    suggestMissingStatusEl.textContent = `Échec de la suggestion IA : ${err.message}`;
  } finally {
    suggestMissingBtn.disabled = false;
  }
});

saveSessionBtn.addEventListener("click", async () => {
  if (currentSlugs.length === 0) return;
  saveSessionBtn.disabled = true;
  saveSessionStatusEl.textContent = "";
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: currentSlugs, name: sessionNameInput.value.trim() || undefined }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error);
    }
    const session = await res.json();
    saveSessionStatusEl.textContent = `Session "${session.name}" sauvegardée — retrouvable dans l'Historique.`;
    sessionNameInput.value = "";
  } catch (err) {
    saveSessionStatusEl.textContent = `Échec de la sauvegarde : ${err.message}`;
  } finally {
    saveSessionBtn.disabled = false;
  }
});

init();
