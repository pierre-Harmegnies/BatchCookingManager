// Code partagé entre les pages (planning.js, review.js) : thème clair/sombre,
// couleurs par recette/équipement, et la carte d'édition d'étape réutilisée
// par l'écran de complétion (planning) et l'écran de revue de recette.

const THEME_KEY = "bcm-theme";
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

export function setupThemeToggle() {
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  if (!themeToggleBtn) return;

  function refresh() {
    const effective = effectiveTheme();
    themeToggleBtn.innerHTML = effective === "dark" ? SUN_ICON : MOON_ICON;
    themeToggleBtn.title = effective === "dark" ? "Passer en thème clair" : "Passer en thème sombre";
  }

  function apply() {
    const stored = getStoredTheme();
    if (stored === "light" || stored === "dark") {
      document.documentElement.dataset.theme = stored;
    } else {
      delete document.documentElement.dataset.theme;
    }
    refresh();
  }

  themeToggleBtn.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // stockage indisponible (navigation privée...) : le thème reste pour la session en cours via data-theme
    }
    document.documentElement.dataset.theme = next;
    refresh();
  });

  apply();
}

// Palette partagée avec l'export PDF (planningPdf.ts) : chaque recette/équipement
// se voit attribuer une couleur stable (par hash du nom), pour repérer d'un
// coup d'œil qui fait quoi.
const COLOR_VARS = ["--h-sky", "--h-amber", "--h-rose", "--h-teal", "--h-violet"];

export function colorVarForKey(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return COLOR_VARS[hash % COLOR_VARS.length];
}

export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** Rend le tableau chronologique d'un planning (utilisé par planning.js et historique.js). */
export function renderScheduleTable(schedule, tbodyEl, makespanEl) {
  tbodyEl.innerHTML = "";
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
    tbodyEl.append(tr);
  }
  if (makespanEl) makespanEl.textContent = `⏱ Temps total : ${formatMinutes(schedule.makespanMinutes)}`;
}

export async function fetchEquipmentList() {
  const res = await fetch("/api/equipment");
  return res.json();
}

// --- Carte d'édition d'une étape (durée/équipement/dépendance/sous-étapes) ---
// Réutilisée pour compléter une étape manquante (écran de planning) et pour
// revoir/corriger une étape déjà configurée (écran "Revoir une recette").

export function createStepEditorCard(step, existingMetadata, equipmentList) {
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

    const top = document.createElement("div");
    top.className = "substep-row-top";
    top.append(descInput, durInput, removeBtn);

    const bottom = document.createElement("div");
    bottom.className = "substep-row-bottom";
    bottom.append(eqWrap, parallelLabel);

    row.append(top, bottom);
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
