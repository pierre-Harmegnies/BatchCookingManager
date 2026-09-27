import Anthropic from "@anthropic-ai/sdk";

export interface SuggestedMetadata {
  durationMinutes: number;
  equipmentIds: string[];
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY non configurée côté serveur.");
  }

  const client = new Anthropic({ apiKey });
  const equipmentList = availableEquipment.map((e) => `- ${e.id}: ${e.name}`).join("\n");

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
    model: "claude-sonnet-5",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Réponse IA inattendue (pas de texte).");
  }

  let text = block.text.trim();
  if (text.startsWith("```")) {
    text = text.split("\n").slice(1, -1).join("\n").trim();
  }

  const parsed = JSON.parse(text) as { duration_minutes: number; equipment_ids: string[] };
  return { durationMinutes: parsed.duration_minutes, equipmentIds: parsed.equipment_ids };
}
