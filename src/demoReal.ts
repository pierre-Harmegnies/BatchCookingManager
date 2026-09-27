import { scheduleRecipes } from "./scheduler.js";
import { fetchRecipeBySlug } from "./macuisine/client.js";
import { toDomainRecipe } from "./macuisine/toDomain.js";
import { closeDb } from "./store/db.js";
import { listEquipment } from "./store/equipmentStore.js";
import { getStepMetadata } from "./store/stepMetadataStore.js";

const SLUGS = [
  "poulet-marine-tomate-yaourt-moutarde-a-l-airfryer",
  "boulettes-sauce-tomate-au-cookeo",
  "goulasch-leger-de-boeuf-au-paprika-pommes-de-terre-vapeur-entree-tomates-basilic",
];

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

async function main() {
  const maCuisineRecipes = await Promise.all(SLUGS.map(fetchRecipeBySlug));

  const allStepIds = maCuisineRecipes.flatMap((r) => r.steps.map((s) => s.id));
  const [equipment, stepMetadataById] = await Promise.all([
    listEquipment(),
    getStepMetadata(allStepIds),
  ]);

  if (equipment.length === 0) {
    throw new Error("Aucun équipement en base — lancer `npm run seed` d'abord.");
  }

  const recipes = [];
  const allMissing = [];
  for (const raw of maCuisineRecipes) {
    const { recipe, missingSteps } = toDomainRecipe(raw, stepMetadataById);
    recipes.push(recipe);
    allMissing.push(...missingSteps);
  }

  if (allMissing.length > 0) {
    console.log(
      `⚠ ${allMissing.length} étape(s) sans métadonnées d'ordonnancement (écran de complétion requis) :`,
    );
    for (const m of allMissing) console.log(`  - [${m.recipeTitle}] ${m.description.slice(0, 60)}`);
    console.log("Ces recettes ne devraient pas être planifiables tant que ces étapes ne sont pas complétées.\n");
  }

  const schedule = scheduleRecipes(recipes, equipment);

  console.log("Planning de préparation (recettes MaCuisine + métadonnées MongoDB)\n");
  for (const step of schedule.steps) {
    const equipmentLabel = step.equipmentIds.length > 0 ? ` [${step.equipmentIds.join(", ")}]` : "";
    console.log(
      `${formatMinutes(step.startMinutes)} -> ${formatMinutes(step.endMinutes)}  ` +
        `${step.recipeTitle} — ${step.description.slice(0, 70)}${equipmentLabel}`,
    );
  }
  console.log(`\nTemps total: ${formatMinutes(schedule.makespanMinutes)}`);

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
