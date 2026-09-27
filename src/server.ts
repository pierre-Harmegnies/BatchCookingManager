import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import { scheduleRecipes } from "./scheduler.js";
import { fetchRecipeBySlug, fetchRecipeList, fetchMenuList, extractRecipesFromMenu } from "./macuisine/client.js";
import { toDomainRecipe, type MissingStep } from "./macuisine/toDomain.js";
import { suggestStepMetadata } from "./ai/suggestStepMetadata.js";
import { listEquipment } from "./store/equipmentStore.js";
import { getStepMetadata, upsertStepMetadata } from "./store/stepMetadataStore.js";
import { generatePlanningPdf } from "./pdf/planningPdf.js";
import type { Schedule } from "./types.js";

function parseSlugs(req: import("express").Request): string[] {
  const slugsParam = req.query.slugs;
  return typeof slugsParam === "string" ? slugsParam.split(",").filter(Boolean) : [];
}

async function buildPlanning(
  slugs: string[],
): Promise<{ schedule: Schedule | null; missingSteps: MissingStep[]; recipeTitles: string[] }> {
  const maCuisineRecipes = await Promise.all(slugs.map(fetchRecipeBySlug));
  const allStepIds = maCuisineRecipes.flatMap((r) => r.steps.map((s) => s.id));
  const [equipment, stepMetadataById] = await Promise.all([listEquipment(), getStepMetadata(allStepIds)]);

  const recipes = [];
  const missingSteps: MissingStep[] = [];
  for (const raw of maCuisineRecipes) {
    const { recipe, missingSteps: missing } = toDomainRecipe(raw, stepMetadataById);
    recipes.push(recipe);
    missingSteps.push(...missing);
  }

  const recipeTitles = maCuisineRecipes.map((r) => r.title);
  if (missingSteps.length > 0) {
    return { schedule: null, missingSteps, recipeTitles };
  }

  const schedule = scheduleRecipes(recipes, equipment);
  return { schedule, missingSteps: [], recipeTitles };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/recipes", async (_req, res) => {
  try {
    const recipes = await fetchRecipeList();
    res.json(recipes);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.get("/api/menus", async (_req, res) => {
  try {
    const menus = await fetchMenuList();
    res.json(
      menus.map((menu) => ({
        id: menu._id,
        name: menu.name,
        weekStart: menu.week_start,
        recipes: extractRecipesFromMenu(menu),
      })),
    );
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.get("/api/equipment", async (_req, res) => {
  const equipment = await listEquipment();
  res.json(equipment);
});

app.get("/api/planning", async (req, res) => {
  const slugs = parseSlugs(req);
  if (slugs.length === 0) {
    return res.status(400).json({ error: "Paramètre 'slugs' requis (liste séparée par des virgules)." });
  }
  if (slugs.length > 4) {
    return res.status(400).json({ error: "Maximum 4 menus par semaine." });
  }

  try {
    const { schedule, missingSteps } = await buildPlanning(slugs);
    res.json({ schedule, missingSteps });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.get("/api/planning/pdf", async (req, res) => {
  const slugs = parseSlugs(req);
  if (slugs.length === 0) {
    return res.status(400).json({ error: "Paramètre 'slugs' requis (liste séparée par des virgules)." });
  }
  if (slugs.length > 4) {
    return res.status(400).json({ error: "Maximum 4 menus par semaine." });
  }

  try {
    const { schedule, missingSteps, recipeTitles } = await buildPlanning(slugs);
    if (!schedule) {
      return res.status(409).json({
        error: "Certaines étapes n'ont pas encore de métadonnées d'ordonnancement.",
        missingSteps,
      });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="planning-batch-cooking.pdf"');
    const doc = generatePlanningPdf(schedule, recipeTitles);
    doc.pipe(res);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.post("/api/step-metadata", async (req, res) => {
  const { stepId, recipeSlug, durationMinutes, equipmentIds, dependsOn } = req.body ?? {};
  if (!stepId || !recipeSlug || typeof durationMinutes !== "number" || !Array.isArray(equipmentIds)) {
    return res.status(400).json({ error: "Champs requis: stepId, recipeSlug, durationMinutes, equipmentIds[]." });
  }
  await upsertStepMetadata(stepId, recipeSlug, { durationMinutes, equipmentIds, dependsOn });
  res.status(204).end();
});

app.post("/api/step-metadata/suggest", async (req, res) => {
  const { description } = req.body ?? {};
  if (!description) {
    return res.status(400).json({ error: "Champ requis: description." });
  }
  try {
    const equipment = await listEquipment();
    const suggestion = await suggestStepMetadata(description, equipment);
    res.json(suggestion);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`BatchCookingManager écoute sur http://localhost:${port}`);
});
