import { setupThemeToggle, colorVarForKey, formatMinutes, fetchEquipmentList, createStepEditorCard } from "./shared.js";

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
    for (const step of data.missingSteps) {
      missingListEl.append(createStepEditorCard(step, null, equipmentList).element);
    }
    missingSectionEl.hidden = false;
    scheduleSectionEl.hidden = true;
  } else {
    missingSectionEl.hidden = true;
    renderSchedule(data.schedule);
    document.getElementById("pdf-link").href = `/api/planning/pdf?slugs=${encodeURIComponent(slugs)}`;
    scheduleSectionEl.hidden = false;
  }
}

function renderSchedule(schedule) {
  scheduleTableBody.innerHTML = "";
  for (const step of schedule.steps) {
    const tr = document.createElement("tr");

    const recipeTd = document.createElement("td");
    recipeTd.className = "recipe-name";
    recipeTd.style.setProperty("--recipe-color", `var(${colorVarForKey(step.recipeTitle)})`);
    recipeTd.textContent = step.recipeTitle;

    const equipmentTd = document.createElement("td");
    for (const id of step.equipmentIds) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.style.setProperty("--tag-color", `var(${colorVarForKey(id)})`);
      tag.textContent = id;
      equipmentTd.append(tag);
    }

    const startTd = document.createElement("td");
    startTd.textContent = formatMinutes(step.startMinutes);
    const endTd = document.createElement("td");
    endTd.textContent = formatMinutes(step.endMinutes);
    const descTd = document.createElement("td");
    descTd.textContent = step.description;

    tr.append(startTd, endTd, recipeTd, descTd, equipmentTd);
    scheduleTableBody.append(tr);
  }
  makespanEl.textContent = `⏱ Temps total : ${formatMinutes(schedule.makespanMinutes)}`;
}

init();
