import type { Equipment, Recipe, Schedule, ScheduledStep, StepDef } from "./types.js";

interface BusyInterval {
  start: number;
  end: number;
}

/**
 * Ordonnance les étapes de plusieurs recettes en parallèle en respectant les
 * dépendances (au sein d'une même recette) et la capacité des équipements
 * partagés (four, feux, casseroles...).
 *
 * Heuristique : Serial Schedule Generation Scheme. À chaque itération, parmi
 * les étapes "éligibles" (dépendances déjà terminées), on choisit celle dont
 * le chemin restant jusqu'à la fin de sa recette est le plus long (poids des
 * successeurs), puis on la place au plus tôt possible compte tenu des
 * équipements disponibles. Suffisant et proche de l'optimal à l'échelle d'un
 * batch cooking perso (quelques recettes, une trentaine d'étapes).
 */
export function scheduleRecipes(recipes: Recipe[], equipment: Equipment[]): Schedule {
  const steps = recipes.flatMap((r) => r.steps);
  const stepById = new Map<string, StepDef>(steps.map((s) => [s.id, s]));
  const recipeById = new Map<string, Recipe>(recipes.map((r) => [r.id, r]));
  const capacityById = new Map<string, number>(equipment.map((e) => [e.id, e.capacity]));

  validateNoCycles(steps, stepById);

  const tailWork = computeTailWork(steps, stepById);

  const finishTime = new Map<string, number>();
  const busyByEquipment = new Map<string, BusyInterval[]>();
  const scheduled: ScheduledStep[] = [];
  const remaining = new Set(steps.map((s) => s.id));

  while (remaining.size > 0) {
    const eligible = [...remaining].filter((id) => {
      const step = stepById.get(id)!;
      return step.dependsOn.every((depId) => finishTime.has(depId));
    });

    if (eligible.length === 0) {
      throw new Error(
        `Dépendance impossible à satisfaire pour les étapes restantes: ${[...remaining].join(", ")}`,
      );
    }

    eligible.sort((a, b) => {
      const byTail = tailWork.get(b)! - tailWork.get(a)!;
      if (byTail !== 0) return byTail;
      return stepById.get(a)!.order - stepById.get(b)!.order;
    });

    const chosenId = eligible[0];
    const step = stepById.get(chosenId)!;

    const readyTime = step.dependsOn.reduce(
      (max, depId) => Math.max(max, finishTime.get(depId)!),
      0,
    );

    const start = earliestFeasibleStart(step, readyTime, busyByEquipment, capacityById);
    const end = start + step.durationMinutes;

    for (const equipmentId of step.equipmentIds) {
      const intervals = busyByEquipment.get(equipmentId) ?? [];
      intervals.push({ start, end });
      busyByEquipment.set(equipmentId, intervals);
    }

    finishTime.set(step.id, end);
    remaining.delete(step.id);
    scheduled.push({
      stepId: step.id,
      recipeId: step.recipeId,
      recipeTitle: recipeById.get(step.recipeId)!.title,
      description: step.description,
      startMinutes: start,
      endMinutes: end,
      equipmentIds: step.equipmentIds,
    });
  }

  scheduled.sort((a, b) => a.startMinutes - b.startMinutes || a.stepId.localeCompare(b.stepId));
  const makespanMinutes = scheduled.reduce((max, s) => Math.max(max, s.endMinutes), 0);

  return { steps: scheduled, makespanMinutes };
}

function computeTailWork(steps: StepDef[], stepById: Map<string, StepDef>): Map<string, number> {
  const successors = new Map<string, string[]>();
  for (const step of steps) {
    for (const depId of step.dependsOn) {
      const list = successors.get(depId) ?? [];
      list.push(step.id);
      successors.set(depId, list);
    }
  }

  const memo = new Map<string, number>();
  function tailWork(id: string): number {
    if (memo.has(id)) return memo.get(id)!;
    const step = stepById.get(id)!;
    const succ = successors.get(id) ?? [];
    const maxSuccessorTail = succ.reduce((max, sId) => Math.max(max, tailWork(sId)), 0);
    const value = step.durationMinutes + maxSuccessorTail;
    memo.set(id, value);
    return value;
  }

  for (const step of steps) tailWork(step.id);
  return memo;
}

function validateNoCycles(steps: StepDef[], stepById: Map<string, StepDef>): void {
  const state = new Map<string, "visiting" | "done">();
  function visit(id: string, path: string[]): void {
    const status = state.get(id);
    if (status === "done") return;
    if (status === "visiting") {
      throw new Error(`Cycle de dépendances détecté: ${[...path, id].join(" -> ")}`);
    }
    state.set(id, "visiting");
    for (const depId of stepById.get(id)!.dependsOn) {
      visit(depId, [...path, id]);
    }
    state.set(id, "done");
  }
  for (const step of steps) visit(step.id, []);
}

function earliestFeasibleStart(
  step: StepDef,
  readyTime: number,
  busyByEquipment: Map<string, BusyInterval[]>,
  capacityById: Map<string, number>,
): number {
  if (step.equipmentIds.length === 0) return readyTime;

  const relevantIntervals = step.equipmentIds.flatMap((id) => busyByEquipment.get(id) ?? []);
  const candidates = new Set<number>([readyTime]);
  for (const interval of relevantIntervals) {
    if (interval.start >= readyTime) candidates.add(interval.start);
    if (interval.end >= readyTime) candidates.add(interval.end);
  }

  const sortedCandidates = [...candidates].sort((a, b) => a - b);

  for (const candidate of sortedCandidates) {
    if (isFeasible(candidate, candidate + step.durationMinutes, step, busyByEquipment, capacityById)) {
      return candidate;
    }
  }

  // Filet de sécurité : ne devrait pas arriver, mais évite une boucle infinie.
  const fallback = relevantIntervals.reduce((max, i) => Math.max(max, i.end), readyTime);
  return fallback;
}

function isFeasible(
  start: number,
  end: number,
  step: StepDef,
  busyByEquipment: Map<string, BusyInterval[]>,
  capacityById: Map<string, number>,
): boolean {
  for (const equipmentId of step.equipmentIds) {
    const capacity = capacityById.get(equipmentId);
    if (capacity === undefined) {
      throw new Error(`Équipement inconnu: ${equipmentId}`);
    }
    const intervals = busyByEquipment.get(equipmentId) ?? [];
    const overlapping = intervals.filter((i) => i.start < end && i.end > start).length;
    if (overlapping + 1 > capacity) return false;
  }
  return true;
}
