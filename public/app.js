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

const reviewSearchEl = document.getElementById("review-recipe-search");
const reviewListEl = document.getElementById("review-recipe-list");
const reviewDetailEl = document.getElementById("review-recipe-detail");
const reviewStepsEl = document.getElementById("review-steps-list");
const reviewTitleEl = document.getElementById("review-recipe-title");
const suggestAllBtn = document.getElementById("suggest-all-btn");
const suggestAllStatusEl = document.getElementById("suggest-all-status");
let currentReviewSlug = null;
let currentReviewCards = [];

// --- Thème clair/sombre (par défaut : suit le système, override persisté) ---

const THEME_KEY = "bcm-theme";
const themeToggleBtn = document.getElementById("theme-toggle-btn");
const SUN_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>`;
const MOON_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>`;

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function effectiveTheme() {
  const stored = getStoredTheme();
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function refreshThemeToggleUI() {
  const effective = effectiveTheme();
  themeToggleBtn.innerHTML = effective === "dark" ? SUN_ICON : MOON_ICON;
  themeToggleBtn.title = effective === "dark" ? "Passer en thème clair" : "Passer en thème sombre";
}

function applyStoredTheme() {
  const stored = getStoredTheme();
  if (stored === "light" || stored === "dark") {
    document.documentElement.dataset.theme = stored;
  } else {
    delete document.documentElement.dataset.theme;
  }
  refreshThemeToggleUI();
}

themeToggleBtn.addEventListener("click", () => {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // stockage indisponible (navigation privée...) : le thème restera pour la session en cours via data-theme
  }
  document.documentElement.dataset.theme = next;
  refreshThemeToggleUI();
});

applyStoredTheme();

async function init() {
  const [recipesRes, equipmentRes, menusRes] = await Promise.all([
    fetch("/api/recipes"),
    fetch("/api/equipment"),
    fetch("/api/menus"),
  ]);
  allRecipes = await recipesRes.json();
  equipmentList = await equipmentRes.json();
  renderRecipeList(allRecipes);
  renderMenuList(await menusRes.json());
  renderReviewRecipeList(allRecipes);
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
      missingListEl.append(createStepEditorCard(step, null).element);
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

// --- Revoir/éditer une recette indépendamment d'un planning ---

function renderReviewRecipeList(recipes) {
  reviewListEl.innerHTML = "";
  for (const recipe of recipes) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary";
    btn.textContent = recipe.title;
    btn.addEventListener("click", () => loadRecipeReview(recipe.slug));
    li.append(btn);
    reviewListEl.append(li);
  }
}

reviewSearchEl.addEventListener("input", () => {
  const q = reviewSearchEl.value.trim().toLowerCase();
  const filtered = q ? allRecipes.filter((r) => r.title.toLowerCase().includes(q)) : allRecipes;
  renderReviewRecipeList(filtered);
});

async function loadRecipeReview(slug) {
  const res = await fetch(`/api/recipes/${encodeURIComponent(slug)}/metadata`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    alert(`Erreur: ${err.error}`);
    return;
  }
  const data = await res.json();

  reviewTitleEl.textContent = data.title;
  reviewTitleEl.style.color = `var(${colorVarForKey(data.title)})`;
  reviewStepsEl.innerHTML = "";
  suggestAllStatusEl.textContent = "";
  currentReviewSlug = data.slug;
  currentReviewCards = data.steps.map((step) => {
    const stepForCard = {
      stepId: step.stepId,
      recipeSlug: data.slug,
      recipeTitle: data.title,
      description: step.description,
    };
    const card = createStepEditorCard(stepForCard, step.metadata);
    reviewStepsEl.append(card.element);
    return card;
  });
  reviewDetailEl.hidden = false;
}

suggestAllBtn.addEventListener("click", async () => {
  if (!currentReviewSlug) return;
  suggestAllBtn.disabled = true;
  suggestAllBtn.textContent = "Suggestion en cours pour toute la recette...";
  suggestAllStatusEl.textContent = "";
  try {
    const res = await fetch(`/api/recipes/${encodeURIComponent(currentReviewSlug)}/suggest-all`, {
      method: "POST",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error);
    }
    const { suggestions } = await res.json();
    for (const card of currentReviewCards) {
      const suggestion = suggestions[card.stepId];
      if (suggestion) card.applySuggestion(suggestion, "Suggestion IA (groupée) appliquée — vérifie et enregistre.");
    }
    suggestAllStatusEl.textContent = `Suggestions appliquées pour ${Object.keys(suggestions).length} étape(s) — vérifie chaque étape avant d'enregistrer.`;
  } catch (err) {
    suggestAllStatusEl.textContent = `Échec de la suggestion IA groupée : ${err.message}`;
  } finally {
    suggestAllBtn.disabled = false;
    suggestAllBtn.textContent = "💡 Suggestion IA pour toute la recette";
  }
});

// --- Carte d'édition d'une étape (durée/équipement/dépendance/sous-étapes) ---
// Réutilisée pour compléter une étape manquante (écran de planning) et pour
// revoir/corriger une étape déjà configurée (écran "Revoir une recette").

function createStepEditorCard(step, existingMetadata) {
  const card = document.createElement("div");
  card.className = "missing-step";
  if (existingMetadata) card.classList.add("already-configured");

  const title = document.createElement("h4");
  title.textContent = step.recipeTitle;
  const desc = document.createElement("div");
  desc.className = "desc";
  desc.textContent = step.description;

  const durationInput = document.createElement("input");
  durationInput.type = "number";
  durationInput.min = "0";
  durationInput.placeholder = "Durée (minutes)";
  if (existingMetadata && !existingMetadata.subSteps?.length) {
    durationInput.value = existingMetadata.durationMinutes;
  }

  const equipmentWrap = document.createElement("div");
  equipmentWrap.className = "equipment-options";
  const checkboxes = {};
  for (const eq of equipmentList) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = eq.id;
    if (existingMetadata && !existingMetadata.subSteps?.length) {
      cb.checked = existingMetadata.equipmentIds?.includes(eq.id) ?? false;
    }
    checkboxes[eq.id] = cb;
    label.append(cb, document.createTextNode(eq.name));
    equipmentWrap.append(label);
  }

  const independentLabel = document.createElement("label");
  independentLabel.className = "independent-toggle";
  const independentCb = document.createElement("input");
  independentCb.type = "checkbox";
  if (existingMetadata && Array.isArray(existingMetadata.dependsOn) && existingMetadata.dependsOn.length === 0) {
    independentCb.checked = true;
  }
  independentLabel.append(
    independentCb,
    document.createTextNode(
      " Étape indépendante (peut être faite en parallèle, ex: pendant qu'un plat mijote — sinon elle attend la fin de l'étape précédente de la même recette)",
    ),
  );

  const simpleFieldsWrap = document.createElement("div");
  simpleFieldsWrap.append(durationInput, equipmentWrap, independentLabel);

  const subStepsWrap = document.createElement("div");
  subStepsWrap.className = "substeps-wrap";
  subStepsWrap.hidden = true;
  const subStepRows = [];
  let subStepCounter = 0;

  function addSubStepRow(prefill) {
    const rowIndex = subStepRows.length;
    const row = document.createElement("div");
    row.className = "substep-row";

    const descInput = document.createElement("input");
    descInput.type = "text";
    descInput.placeholder = "Description de la sous-étape";
    descInput.value = prefill?.description ?? "";

    const durInput = document.createElement("input");
    durInput.type = "number";
    durInput.min = "0";
    durInput.placeholder = "Durée (min)";
    if (prefill?.durationMinutes != null) durInput.value = prefill.durationMinutes;

    const eqWrap = document.createElement("div");
    eqWrap.className = "equipment-options";
    const eqBoxes = {};
    for (const eq of equipmentList) {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = eq.id;
      if (prefill?.equipmentIds?.includes(eq.id)) cb.checked = true;
      eqBoxes[eq.id] = cb;
      label.append(cb, document.createTextNode(eq.name));
      eqWrap.append(label);
    }

    const parallelLabel = document.createElement("label");
    parallelLabel.className = "parallel-toggle";
    const parallelCb = document.createElement("input");
    parallelCb.type = "checkbox";
    if (rowIndex === 0) parallelCb.disabled = true;
    else if (prefill?.parallelWithPrevious) parallelCb.checked = true;
    parallelLabel.append(parallelCb, document.createTextNode(" en parallèle de la précédente"));

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "secondary";
    removeBtn.textContent = "Retirer";
    removeBtn.addEventListener("click", () => {
      row.remove();
      subStepRows.splice(subStepRows.indexOf(rowData), 1);
    });

    row.append(descInput, durInput, eqWrap, parallelLabel, removeBtn);
    subStepsWrap.insertBefore(row, addSubStepBtn);

    const rowData = {
      id: prefill?.id ?? `sub-${++subStepCounter}`,
      getData: () => ({
        id: rowData.id,
        description: descInput.value.trim(),
        durationMinutes: Number(durInput.value),
        equipmentIds: Object.keys(eqBoxes).filter((id) => eqBoxes[id].checked),
        parallelWithPrevious: parallelCb.checked,
      }),
    };
    subStepRows.push(rowData);
  }

  const addSubStepBtn = document.createElement("button");
  addSubStepBtn.type = "button";
  addSubStepBtn.className = "secondary";
  addSubStepBtn.textContent = "+ Ajouter une sous-étape";
  addSubStepBtn.addEventListener("click", () => addSubStepRow());
  subStepsWrap.append(addSubStepBtn);

  let splitMode = false;
  const splitToggleBtn = document.createElement("button");
  splitToggleBtn.type = "button";
  splitToggleBtn.className = "secondary";
  splitToggleBtn.textContent = "Diviser en sous-étapes";
  splitToggleBtn.title = "Utile si cette étape MaCuisine mélange plusieurs actions distinctes (ex: \"poêler les haricots ET cuire les pâtes\")";
  function enterSplitMode() {
    splitMode = true;
    simpleFieldsWrap.hidden = true;
    subStepsWrap.hidden = false;
    splitToggleBtn.textContent = "Revenir à une seule étape";
  }
  splitToggleBtn.addEventListener("click", () => {
    if (splitMode) {
      splitMode = false;
      simpleFieldsWrap.hidden = false;
      subStepsWrap.hidden = true;
      splitToggleBtn.textContent = "Diviser en sous-étapes";
    } else {
      enterSplitMode();
      if (subStepRows.length === 0) {
        addSubStepRow({ description: step.description });
        addSubStepRow();
      }
    }
  });

  if (existingMetadata?.subSteps?.length) {
    enterSplitMode();
    for (const sub of existingMetadata.subSteps) addSubStepRow(sub);
  }

  const status = document.createElement("div");
  status.className = "status";
  if (existingMetadata) {
    status.textContent = "Configuration existante — modifie et enregistre si besoin.";
  }

  function applySuggestion(suggestion, statusText) {
    durationInput.value = suggestion.durationMinutes;
    for (const id of Object.keys(checkboxes)) {
      checkboxes[id].checked = suggestion.equipmentIds.includes(id);
    }
    status.textContent = statusText ?? "Suggestion IA appliquée — vérifie et enregistre.";
  }

  const suggestBtn = document.createElement("button");
  suggestBtn.type = "button";
  suggestBtn.className = "secondary";
  suggestBtn.textContent = "Suggérer via IA";
  suggestBtn.addEventListener("click", async () => {
    suggestBtn.disabled = true;
    suggestBtn.textContent = "Suggestion en cours...";
    try {
      const res = await fetch("/api/step-metadata/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: step.description }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error);
      }
      applySuggestion(await res.json());
    } catch (err) {
      status.textContent = `Échec de la suggestion IA: ${err.message}`;
    } finally {
      suggestBtn.disabled = false;
      suggestBtn.textContent = "Suggérer via IA";
    }
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Enregistrer";
  saveBtn.addEventListener("click", async () => {
    let payload;

    if (splitMode) {
      const subSteps = subStepRows.map((r) => r.getData());
      const invalid = subSteps.find((s) => !s.description || !s.durationMinutes || s.durationMinutes <= 0);
      if (invalid || subSteps.length === 0) {
        status.textContent = "Chaque sous-étape a besoin d'une description et d'une durée valide.";
        return;
      }
      payload = { stepId: step.stepId, recipeSlug: step.recipeSlug, subSteps };
    } else {
      const durationMinutes = Number(durationInput.value);
      if (!durationMinutes || durationMinutes <= 0) {
        status.textContent = "Indique une durée valide avant d'enregistrer.";
        return;
      }
      const equipmentIds = Object.keys(checkboxes).filter((id) => checkboxes[id].checked);
      payload = { stepId: step.stepId, recipeSlug: step.recipeSlug, durationMinutes, equipmentIds };
      if (independentCb.checked) payload.dependsOn = [];
    }

    const res = await fetch("/api/step-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      status.textContent = `Erreur: ${err.error}`;
      return;
    }
    card.classList.add("saved");
    status.textContent = "Enregistré ✓";
  });

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(suggestBtn, splitToggleBtn, saveBtn);

  card.append(title, desc, simpleFieldsWrap, subStepsWrap, actions, status);
  return { element: card, stepId: step.stepId, applySuggestion };
}

// Palette partagée avec l'export PDF (planningPdf.ts) : chaque recette/équipement
// se voit attribuer une couleur stable (par hash du nom), pour repérer d'un
// coup d'œil qui fait quoi dans le tableau du planning.
const COLOR_VARS = ["--h-sky", "--h-amber", "--h-rose", "--h-teal", "--h-violet"];

function colorVarForKey(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return COLOR_VARS[hash % COLOR_VARS.length];
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

function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

init();
