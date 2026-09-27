import Anthropic from "@anthropic-ai/sdk";

export interface SuggestedMetadata {
  durationMinutes: number;
  equipmentIds: string[];
}

/**
 * Modèle utilisé pour les suggestions de métadonnées d'ordonnancement. La
 * tâche (estimer une durée + choisir dans une liste fermée d'équipements à
 * partir d'un texte court) est de l'extraction structurée simple, pas un
 * raisonnement complexe — Haiku est nettement moins cher que Sonnet et
 * largement suffisant ici, d'autant que le résultat reste toujours soumis à
 * validation manuelle avant enregistrement.
 */
const MODEL = "claude-haiku-4-5-20251001";

function buildEquipmentList(availableEquipment: { id: string; name: string }[]): string {
  return availableEquipment.map((e) => `- ${e.id}: ${e.name}`).join("\n");
}

function parseJsonResponse<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.split("\n").slice(1, -1).join("\n").trim();
  }
  return JSON.parse(cleaned) as T;
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY non configurée côté serveur.");
  }
  return new Anthropic({ apiKey });
}

/**
 * Suggestion IA de durée + équipement pour une étape de recette, à partir de
 * sa description. Toujours déclenchée explicitement par l'utilisateur (bouton
 * dédié côté UI) — jamais automatique — et le résultat n'est qu'une
 * proposition : il doit être validé/corrigé manuellement avant d'être
 * enregistré (voir POST /api/step-metadata).
 */
export async function suggestStepMetadata(
  description: string,
  availableEquipment: { id: string; name: string }[],
): Promise<SuggestedMetadata> {
  const client = getClient();
  const equipmentList = buildEquipmentList(availableEquipment);

  const prompt = `Voici une étape d'une recette de cuisine :
"""
${description}
"""

Équipements disponibles (utilise uniquement ces ids, celui qui correspond le mieux si besoin, ou aucun) :
${equipmentList}

Estime la durée de cette étape en minutes, et la liste des équipements de la liste ci-dessus réellement nécessaires pendant toute la durée de l'étape (occupation physique de l'appareil, pas juste une mention en passant). Si l'étape nécessite une présence active de la personne qui cuisine (couper, mélanger, surveiller...), inclus "cuisinier" si présent dans la liste. Si l'étape est passive (attente, marinade, cuisson autonome sans surveillance), ne l'inclus pas.

Retourne UNIQUEMENT un JSON de cette forme, sans markdown ni explication :
{"duration_minutes": <entier>, "equipment_ids": [<ids>]}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Réponse IA inattendue (pas de texte).");
  }

  const parsed = parseJsonResponse<{ duration_minutes: number; equipment_ids: string[] }>(block.text);
  return { durationMinutes: parsed.duration_minutes, equipmentIds: parsed.equipment_ids };
}

/**
 * Suggestion IA pour TOUTES les étapes d'une recette en un seul appel (au
 * lieu d'un appel par étape) — même principe et mêmes garanties que
 * `suggestStepMetadata` (jamais appliqué automatiquement, validation manuelle
 * requise), mais un seul aller-retour à l'API pour limiter le coût lors
 * d'une revue complète de recette.
 */
export async function suggestStepMetadataBatch(
  steps: { stepId: string; description: string }[],
  availableEquipment: { id: string; name: string }[],
): Promise<Record<string, SuggestedMetadata>> {
  if (steps.length === 0) return {};

  const client = getClient();
  const equipmentList = buildEquipmentList(availableEquipment);
  const stepsList = steps.map((s, i) => `${i}. """${s.description}"""`).join("\n");

  const prompt = `Voici les étapes d'une recette de cuisine, numérotées :
${stepsList}

Équipements disponibles (utilise uniquement ces ids) :
${equipmentList}

Pour CHAQUE étape (dans l'ordre, une entrée par étape), estime sa durée en minutes et la liste des équipements réellement nécessaires pendant toute sa durée (occupation physique de l'appareil, pas juste une mention en passant). Si une étape nécessite une présence active (couper, mélanger, surveiller...), inclus "cuisinier" si présent dans la liste. Si elle est passive (attente, marinade, cuisson autonome), ne l'inclus pas.

Retourne UNIQUEMENT un JSON de cette forme, un élément par étape dans le même ordre, sans markdown ni explication :
[{"duration_minutes": <entier>, "equipment_ids": [<ids>]}, ...]`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256 * steps.length,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Réponse IA inattendue (pas de texte).");
  }

  const parsed = parseJsonResponse<{ duration_minutes: number; equipment_ids: string[] }[]>(block.text);
  if (parsed.length !== steps.length) {
    throw new Error(`Réponse IA incohérente : ${parsed.length} suggestion(s) pour ${steps.length} étape(s).`);
  }

  const result: Record<string, SuggestedMetadata> = {};
  steps.forEach((step, i) => {
    result[step.stepId] = { durationMinutes: parsed[i].duration_minutes, equipmentIds: parsed[i].equipment_ids };
  });
  return result;
}
