import { setupThemeToggle, colorVarForKey, fetchEquipmentList, createStepEditorCard } from "./shared.js";

setupThemeToggle();

let allRecipes = [];
let equipmentList = [];
let currentReviewSlug = null;
let currentReviewCards = [];

const reviewSearchEl = document.getElementById("review-recipe-search");
const reviewListEl = document.getElementById("review-recipe-list");
const reviewDetailEl = document.getElementById("review-recipe-detail");
const reviewStepsEl = document.getElementById("review-steps-list");
const reviewTitleEl = document.getElementById("review-recipe-title");
const suggestAllBtn = document.getElementById("suggest-all-btn");
const suggestAllStatusEl = document.getElementById("suggest-all-status");

async function init() {
  const [recipesRes, equipment] = await Promise.all([fetch("/api/recipes"), fetchEquipmentList()]);
  allRecipes = await recipesRes.json();
  equipmentList = equipment;
  renderReviewRecipeList(allRecipes);
}

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
    const card = createStepEditorCard(stepForCard, step.metadata, equipmentList);
    reviewStepsEl.append(card.element);
    return card;
  });
  reviewDetailEl.hidden = false;
}

suggestAllBtn.addEventListener("click", async () => {
  if (!currentReviewSlug) return;
  suggestAllBtn.disabled = true;
  suggestAllStatusEl.textContent = "Suggestion en cours pour toute la recette...";
  try {
    const res = await fetch(`/api/recipes/${encodeURIComponent(currentReviewSlug)}/suggest-all`, {
      method: "POST",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error);
    }
    const { suggestions } = await res.json();
    let splitCount = 0;
    for (const card of currentReviewCards) {
      const suggestion = suggestions[card.stepId];
      if (!suggestion) continue;
      const isSplit = suggestion.split && suggestion.subSteps?.length > 1;
      if (isSplit) splitCount++;
      card.applySuggestion(
        suggestion,
        isSplit
          ? `Suggestion IA (groupée) : étape divisée en ${suggestion.subSteps.length} sous-étapes — vérifie et enregistre.`
          : "Suggestion IA (groupée) appliquée — vérifie et enregistre.",
      );
    }
    const splitNote = splitCount > 0 ? ` (dont ${splitCount} divisée(s) en sous-étapes)` : "";
    suggestAllStatusEl.textContent = `Suggestions appliquées pour ${Object.keys(suggestions).length} étape(s)${splitNote} — vérifie chaque étape avant d'enregistrer.`;
  } catch (err) {
    suggestAllStatusEl.textContent = `Échec de la suggestion IA groupée : ${err.message}`;
  } finally {
    suggestAllBtn.disabled = false;
  }
});

init();
