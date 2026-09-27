export interface Equipment {
  id: string;
  name: string;
  /** Nombre d'étapes pouvant utiliser cet équipement simultanément. */
  capacity: number;
}

export interface StepDef {
  /** Unique dans tout le planning, convention: `${recipeId}:${order}`. */
  id: string;
  recipeId: string;
  order: number;
  description: string;
  durationMinutes: number;
  equipmentIds: string[];
  /** Ids d'étapes (généralement de la même recette) devant être terminées avant celle-ci. */
  dependsOn: string[];
}

export interface Recipe {
  id: string;
  title: string;
  steps: StepDef[];
}

export interface ScheduledStep {
  stepId: string;
  recipeId: string;
  recipeTitle: string;
  description: string;
  startMinutes: number;
  endMinutes: number;
  equipmentIds: string[];
}

export interface Schedule {
  steps: ScheduledStep[];
  makespanMinutes: number;
}
