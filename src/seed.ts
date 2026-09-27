import { fetchRecipeBySlug } from "./macuisine/client.js";
import { equipment, stepMetadataById } from "./macuisine/sampleMetadata.js";
import { closeDb } from "./store/db.js";
import { upsertEquipment } from "./store/equipmentStore.js";
import { upsertStepMetadata } from "./store/stepMetadataStore.js";

const SLUGS = [
  "poulet-marine-tomate-yaourt-moutarde-a-l-airfryer",
  "boulettes-sauce-tomate-au-cookeo",
  "goulasch-leger-de-boeuf-au-paprika-pommes-de-terre-vapeur-entree-tomates-basilic",
];

/**
 * Charge dans MongoDB (base `batch_cooking`) l'équipement et les métadonnées
 * d'ordonnancement actuellement codées en dur dans `sampleMetadata.ts`, le
 * temps que l'écran de complétion existe. Idempotent (upsert).
 */
async function main() {
  for (const e of equipment) {
    await upsertEquipment(e);
  }
  console.log(`${equipment.length} équipement(s) chargé(s).`);

  const recipes = await Promise.all(SLUGS.map(fetchRecipeBySlug));
  let count = 0;
  for (const recipe of recipes) {
    for (const step of recipe.steps) {
      const metadata = stepMetadataById[step.id];
      if (!metadata) continue;
      await upsertStepMetadata(step.id, recipe.slug, metadata);
      count++;
    }
  }
  console.log(`${count} étape(s) avec métadonnées chargée(s).`);

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
