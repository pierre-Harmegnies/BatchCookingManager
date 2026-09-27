import type { StepMetadata, SubStepMetadata } from "../macuisine/sampleMetadata.js";
import { getDb } from "./db.js";

interface StepMetadataDoc {
  _id: string; // step id MaCuisine (UUID stable)
  recipeSlug: string;
  durationMinutes: number;
  equipmentIds: string[];
  dependsOn?: string[];
  subSteps?: SubStepMetadata[];
}

export async function getStepMetadata(stepIds: string[]): Promise<Record<string, StepMetadata>> {
  if (stepIds.length === 0) return {};
  const db = await getDb();
  const docs = await db
    .collection<StepMetadataDoc>("step_metadata")
    .find({ _id: { $in: stepIds } })
    .toArray();

  const result: Record<string, StepMetadata> = {};
  for (const doc of docs) {
    result[doc._id] = {
      durationMinutes: doc.durationMinutes,
      equipmentIds: doc.equipmentIds,
      dependsOn: doc.dependsOn,
      subSteps: doc.subSteps,
    };
  }
  return result;
}

export async function upsertStepMetadata(
  stepId: string,
  recipeSlug: string,
  metadata: StepMetadata,
): Promise<void> {
  const db = await getDb();
  await db.collection<StepMetadataDoc>("step_metadata").updateOne(
    { _id: stepId },
    {
      $set: {
        recipeSlug,
        durationMinutes: metadata.durationMinutes,
        equipmentIds: metadata.equipmentIds,
        dependsOn: metadata.dependsOn,
        subSteps: metadata.subSteps,
      },
    },
    { upsert: true },
  );
}
