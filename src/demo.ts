import { scheduleRecipes } from "./scheduler.js";
import { equipment, recipes } from "./mockData.js";

const schedule = scheduleRecipes(recipes, equipment);

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

console.log("Planning de préparation (batch cooking)\n");

for (const step of schedule.steps) {
  const equipmentLabel = step.equipmentIds.length > 0 ? ` [${step.equipmentIds.join(", ")}]` : "";
  console.log(
    `${formatMinutes(step.startMinutes)} -> ${formatMinutes(step.endMinutes)}  ` +
      `${step.recipeTitle} — ${step.description}${equipmentLabel}`,
  );
}

console.log(`\nTemps total: ${formatMinutes(schedule.makespanMinutes)}`);
