import type { Recipe, StepDef } from "../types.js";
import type { MaCuisineRecipe } from "./client.js";
import type { StepMetadata } from "./sampleMetadata.js";

export interface MissingStep {
  stepId: string;
  recipeSlug: string;
  recipeTitle: string;
  description: string;
}

export interface DomainConversionResult {
  recipe: Recipe;
  /** Étapes sans métadonnées d'ordonnancement — à faire remplir via l'écran de complétion avant de pouvoir planifier. */
  missingSteps: MissingStep[];
}

/**
 * Convertit une recette MaCuisine (titre + étapes brutes) en recette du domaine
 * BatchCookingManager, en complétant chaque étape avec ses métadonnées
 * d'ordonnancement (durée, équipement, dépendances).
 *
 * Par défaut, une étape dépend de l'étape précédente de la même recette
 * (enchaînement séquentiel classique d'une recette) ; `metadataByStepId` peut
 * surcharger `dependsOn` explicitement pour libérer une étape indépendante
 * (ex: garniture préparable pendant que le plat principal mijote).
 */
export function toDomainRecipe(
  maCuisineRecipe: MaCuisineRecipe,
  metadataByStepId: Record<string, StepMetadata>,
): DomainConversionResult {
  const sortedSteps = [...maCuisineRecipe.steps].sort((a, b) => a.order - b.order);
  const missingSteps: MissingStep[] = [];

  const steps: StepDef[] = sortedSteps.map((step, index) => {
    const metadata = metadataByStepId[step.id];
    if (!metadata) {
      missingSteps.push({
        stepId: step.id,
        recipeSlug: maCuisineRecipe.slug,
        recipeTitle: maCuisineRecipe.title,
        description: step.description,
      });
    }

    const previousStepId = index > 0 ? sortedSteps[index - 1].id : undefined;
    const defaultDependsOn = previousStepId ? [previousStepId] : [];

    return {
      id: step.id,
      recipeId: maCuisineRecipe.slug,
      order: step.order,
      description: step.description,
      durationMinutes: metadata?.durationMinutes ?? 0,
      equipmentIds: metadata?.equipmentIds ?? [],
      dependsOn: metadata?.dependsOn ?? defaultDependsOn,
    };
  });

  return {
    recipe: { id: maCuisineRecipe.slug, title: maCuisineRecipe.title, steps },
    missingSteps,
  };
}
