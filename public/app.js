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
  const [recipesRes, equipmentRes, menusRes] = await Promise.all([
    fetch("/api/recipes"),
    fetch("/api/equipment"),
    fetch("/api/menus"),
  ]);
  allRecipes = await recipesRes.json();
  equipmentList = await equipmentRes.json();
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
    renderMissingSteps(data.missingSteps);
    missingSectionEl.hidden = false;
    scheduleSectionEl.hidden = true;
  } else {
    missingSectionEl.hidden = true;
    renderSchedule(data.schedule);
    document.getElementById("pdf-link").href = `/api/planning/pdf?slugs=${encodeURIComponent(slugs)}`;
    scheduleSectionEl.hidden = false;
  }
}

function renderMissingSteps(missingSteps) {
  missingListEl.innerHTML = "";
  for (const step of missingSteps) {
    const card = document.createElement("div");
    card.className = "missing-step";

    const title = document.createElement("h4");
    title.textContent = step.recipeTitle;
    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = step.description;

    const durationInput = document.createElement("input");
    durationInput.type = "number";
    durationInput.min = "0";
    durationInput.placeholder = "Durée (minutes)";

    const equipmentWrap = document.createElement("div");
    equipmentWrap.className = "equipment-options";
    const checkboxes = {};
    for (const eq of equipmentList) {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = eq.id;
      checkboxes[eq.id] = cb;
      label.append(cb, document.createTextNode(eq.name));
      equipmentWrap.append(label);
    }

    const independentLabel = document.createElement("label");
    independentLabel.className = "independent-toggle";
    const independentCb = document.createElement("input");
    independentCb.type = "checkbox";
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

      const eqWrap = document.createElement("div");
      eqWrap.className = "equipment-options";
      const eqBoxes = {};
      for (const eq of equipmentList) {
        const label = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = eq.id;
        eqBoxes[eq.id] = cb;
        label.append(cb, document.createTextNode(eq.name));
        eqWrap.append(label);
      }

      const parallelLabel = document.createElement("label");
      parallelLabel.className = "parallel-toggle";
      const parallelCb = document.createElement("input");
      parallelCb.type = "checkbox";
      if (rowIndex === 0) parallelCb.disabled = true;
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
        id: `sub-${++subStepCounter}`,
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
    splitToggleBtn.addEventListener("click", () => {
      splitMode = !splitMode;
      simpleFieldsWrap.hidden = splitMode;
      subStepsWrap.hidden = !splitMode;
      splitToggleBtn.textContent = splitMode ? "Revenir à une seule étape" : "Diviser en sous-étapes";
      if (splitMode && subStepRows.length === 0) {
        addSubStepRow({ description: step.description });
        addSubStepRow();
      }
    });

    const status = document.createElement("div");
    status.className = "status";

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
        const suggestion = await res.json();
        durationInput.value = suggestion.durationMinutes;
        for (const id of Object.keys(checkboxes)) {
          checkboxes[id].checked = suggestion.equipmentIds.includes(id);
        }
        status.textContent = "Suggestion IA appliquée — vérifie et enregistre.";
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
    missingListEl.append(card);
  }
}

function renderSchedule(schedule) {
  scheduleTableBody.innerHTML = "";
  for (const step of schedule.steps) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatMinutes(step.startMinutes)}</td>
      <td>${formatMinutes(step.endMinutes)}</td>
      <td>${escapeHtml(step.recipeTitle)}</td>
      <td>${escapeHtml(step.description)}</td>
      <td>${step.equipmentIds.map((id) => `<span class="tag">${escapeHtml(id)}</span>`).join("")}</td>
    `;
    scheduleTableBody.append(tr);
  }
  makespanEl.textContent = `Temps total : ${formatMinutes(schedule.makespanMinutes)}`;
}

function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
