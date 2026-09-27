import type { Recipe, StepDef } from "../types.js";
import type { MaCuisineRecipe, MaCuisineStep } from "./client.js";
import type { StepMetadata, SubStepMetadata } from "./sampleMetadata.js";

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
 * Regroupe les sous-étapes d'une étape raffinée en "vagues" : les sous-étapes
 * marquées `parallelWithPrevious` rejoignent la vague de la précédente (même
 * dépendance qu'elle, exécutables en même temps) ; une sous-étape normale
 * démarre une nouvelle vague qui dépend de TOUTE la vague précédente.
 *
 * `entryIds` = sous-étapes de la première vague (héritent de la dépendance
 * externe de l'étape parente). `exitIds` = sous-étapes de la dernière vague
 * (ce dont dépendent les étapes qui suivaient l'étape parente).
 */
function computeSubStepWaves(subSteps: SubStepMetadata[]): {
  localDependsOn: Map<string, string[]>;
  entryIds: string[];
  exitIds: string[];
} {
  const localDependsOn = new Map<string, string[]>();
  let group: string[] = [];
  let waveDependsOn: string[] = [];

  for (const sub of subSteps) {
    if (sub.parallelWithPrevious && group.length > 0) {
      localDependsOn.set(sub.id, waveDependsOn);
      group.push(sub.id);
    } else {
      const deps = group.length > 0 ? [...group] : [];
      localDependsOn.set(sub.id, deps);
      waveDependsOn = deps;
      group = [sub.id];
    }
  }

  const entryIds = subSteps.filter((s) => localDependsOn.get(s.id)!.length === 0).map((s) => s.id);
  return { localDependsOn, entryIds, exitIds: group };
}

/**
 * Convertit une recette MaCuisine (titre + étapes brutes) en recette du domaine
 * BatchCookingManager, en complétant chaque étape avec ses métadonnées
 * d'ordonnancement (durée, équipement, dépendances) et en "éclatant" les
 * étapes raffinées (`subSteps`) en plusieurs entrées planifiables, sans jamais
 * modifier la recette originale dans MaCuisine.
 *
 * Par défaut, une étape dépend de l'étape précédente de la même recette ;
 * `metadataByStepId` peut surcharger `dependsOn` explicitement (étape
 * indépendante) ou fournir `subSteps` pour raffiner une étape trop groupée
 * (ex: "poêler les haricots ET cuire les pâtes" → deux sous-étapes).
 */
export function toDomainRecipe(
  maCuisineRecipe: MaCuisineRecipe,
  metadataByStepId: Record<string, StepMetadata>,
): DomainConversionResult {
  const sortedSteps = [...maCuisineRecipe.steps].sort((a, b) => a.order - b.order);
  const missingSteps: MissingStep[] = [];

  // Passe 1 : dépendances externes résolues (au niveau des ids MaCuisine
  // d'origine) + calcul de la "sortie" de chaque étape (elle-même si pas
  // raffinée, ou les sous-étapes de sa dernière vague sinon).
  const resolvedDependsOn = new Map<string, string[]>();
  const exitIds = new Map<string, string[]>();

  sortedSteps.forEach((step: MaCuisineStep, index) => {
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
    resolvedDependsOn.set(step.id, metadata?.dependsOn ?? defaultDependsOn);

    if (metadata?.subSteps && metadata.subSteps.length > 0) {
      const { exitIds: subExitIds } = computeSubStepWaves(metadata.subSteps);
      exitIds.set(
        step.id,
        subExitIds.map((subId) => `${step.id}::${subId}`),
      );
    } else {
      exitIds.set(step.id, [step.id]);
    }
  });

  const resolveExternalDependsOn = (depIds: string[]): string[] =>
    depIds.flatMap((depId) => exitIds.get(depId) ?? [depId]);

  // Passe 2 : construction des StepDef, en éclatant les étapes raffinées.
  const steps: StepDef[] = sortedSteps.flatMap((step) => {
    const metadata = metadataByStepId[step.id];
    const externalDependsOn = resolveExternalDependsOn(resolvedDependsOn.get(step.id) ?? []);

    if (metadata?.subSteps && metadata.subSteps.length > 0) {
      const { localDependsOn, entryIds } = computeSubStepWaves(metadata.subSteps);
      return metadata.subSteps.map((sub): StepDef => {
        const isEntry = entryIds.includes(sub.id);
        const dependsOn = isEntry
          ? externalDependsOn
          : localDependsOn.get(sub.id)!.map((localId) => `${step.id}::${localId}`);
        return {
          id: `${step.id}::${sub.id}`,
          recipeId: maCuisineRecipe.slug,
          order: step.order,
          description: sub.description,
          durationMinutes: sub.durationMinutes,
          equipmentIds: sub.equipmentIds,
          dependsOn,
        };
      });
    }

    return [
      {
        id: step.id,
        recipeId: maCuisineRecipe.slug,
        order: step.order,
        description: step.description,
        durationMinutes: metadata?.durationMinutes ?? 0,
        equipmentIds: metadata?.equipmentIds ?? [],
        dependsOn: externalDependsOn,
      },
    ];
  });

  return {
    recipe: { id: maCuisineRecipe.slug, title: maCuisineRecipe.title, steps },
    missingSteps,
  };
}
