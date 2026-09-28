import Anthropic from "@anthropic-ai/sdk";

export interface SubStepSuggestion {
  description: string;
  durationMinutes: number;
  equipmentIds: string[];
  parallelWithPrevious: boolean;
}

/**
 * Une étape MaCuisine peut être suggérée soit comme une action unique
 * (`split: false`), soit découpée en plusieurs sous-étapes logiques
 * (`split: true`) quand elle regroupe visiblement plusieurs actions
 * distinctes (ex: "poêler les haricots ET cuire les pâtes"). Dans les deux
 * cas, ce n'est qu'une proposition — jamais appliquée automatiquement.
 */
export type StepSuggestion =
  | { split: false; durationMinutes: number; equipmentIds: string[] }
  | { split: true; subSteps: SubStepSuggestion[] };

interface RawSimple {
  split?: false;
  duration_minutes: number;
  equipment_ids: string[];
}
interface RawSplit {
  split: true;
  sub_steps: { description: string; duration_minutes: number; equipment_ids: string[]; parallel_with_previous: boolean }[];
}
type RawSuggestion = RawSimple | RawSplit;

/**
 * Modèle utilisé pour les suggestions de métadonnées d'ordonnancement. La
 * tâche (estimer une durée, choisir dans une liste fermée d'équipements,
 * repérer si une étape regroupe plusieurs actions) reste de l'extraction/
 * décomposition structurée assez bornée — Haiku est nettement moins cher que
 * Sonnet et suffisant ici, d'autant que le résultat reste toujours soumis à
 * validation manuelle avant enregistrement.
 */
const MODEL = "claude-haiku-4-5-20251001";

const SPLIT_INSTRUCTIONS = `Si cette étape ne décrit qu'UNE seule action cohérente, réponds au format simple.
Si elle regroupe PLUSIEURS actions distinctes qui gagneraient à être planifiées séparément (ex: deux préparations indépendantes dans la même phrase, une action passive suivie d'une active, une garniture préparable pendant une cuisson...), découpe-la en plusieurs sous-étapes logiques et ordonnées. Ne découpe pas artificiellement une action déjà unitaire.

Pour chaque sous-étape :
- une description courte et actionnable (pas de simple copie d'un bout de phrase)
- une durée réaliste en minutes
- les équipements réellement nécessaires pendant toute sa durée (dont "cuisinier" si présence active requise — couper, mélanger, surveiller — absent si action passive/autonome)
- "parallel_with_previous": true si cette sous-étape peut se faire EN MÊME TEMPS que la précédente (aucune des deux n'a besoin du résultat de l'autre), false si elle doit attendre que la précédente soit terminée. La toute première sous-étape a toujours parallel_with_previous à false.`;

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

function fromRaw(raw: RawSuggestion): StepSuggestion {
  if (raw.split) {
    return {
      split: true,
      subSteps: raw.sub_steps.map((s) => ({
        description: s.description,
        durationMinutes: s.duration_minutes,
        equipmentIds: s.equipment_ids,
        parallelWithPrevious: s.parallel_with_previous,
      })),
    };
  }
  return { split: false, durationMinutes: raw.duration_minutes, equipmentIds: raw.equipment_ids };
}

/**
 * Suggestion IA pour une étape de recette, à partir de sa description :
 * durée + équipement (cas simple), ou découpage en sous-étapes logiques si
 * l'étape regroupe plusieurs actions distinctes. Toujours déclenchée
 * explicitement par l'utilisateur (bouton dédié côté UI) — jamais
 * automatique — et le résultat n'est qu'une proposition : il doit être
 * validé/corrigé manuellement avant d'être enregistré (voir POST
 * /api/step-metadata).
 */
export async function suggestStepMetadata(
  description: string,
  availableEquipment: { id: string; name: string }[],
): Promise<StepSuggestion> {
  const client = getClient();
  const equipmentList = buildEquipmentList(availableEquipment);

  const prompt = `Voici une étape d'une recette de cuisine :
"""
${description}
"""

Équipements disponibles (utilise uniquement ces ids, celui qui correspond le mieux si besoin, ou aucun) :
${equipmentList}

${SPLIT_INSTRUCTIONS}

Retourne UNIQUEMENT un JSON, sans markdown ni explication, selon l'un de ces deux formats :

Pas de découpage :
{"split": false, "duration_minutes": <entier>, "equipment_ids": [<ids>]}

Découpage (au moins 2 sous-étapes) :
{"split": true, "sub_steps": [{"description": "...", "duration_minutes": <entier>, "equipment_ids": [<ids>], "parallel_with_previous": <bool>}, ...]}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Réponse IA inattendue (pas de texte).");
  }

  return fromRaw(parseJsonResponse<RawSuggestion>(block.text));
}

/**
 * Suggestion IA pour TOUTES les étapes d'une recette en un seul appel (au
 * lieu d'un appel par étape) — même principe et mêmes garanties que
 * `suggestStepMetadata` (découpage possible, jamais appliqué automatiquement,
 * validation manuelle requise), mais un seul aller-retour à l'API pour
 * limiter le coût lors d'une revue complète de recette.
 */
export async function suggestStepMetadataBatch(
  steps: { stepId: string; description: string }[],
  availableEquipment: { id: string; name: string }[],
): Promise<Record<string, StepSuggestion>> {
  if (steps.length === 0) return {};

  const client = getClient();
  const equipmentList = buildEquipmentList(availableEquipment);
  const stepsList = steps.map((s, i) => `${i}. """${s.description}"""`).join("\n");

  const prompt = `Voici les étapes d'une recette de cuisine, numérotées :
${stepsList}

Équipements disponibles (utilise uniquement ces ids) :
${equipmentList}

Pour CHAQUE étape (dans l'ordre, une entrée par étape), décide si elle doit être découpée ou traitée comme une seule action.

${SPLIT_INSTRUCTIONS}

Retourne UNIQUEMENT un JSON : un tableau d'un élément par étape dans le même ordre, sans markdown ni explication. Chaque élément suit l'un de ces deux formats :

Pas de découpage :
{"split": false, "duration_minutes": <entier>, "equipment_ids": [<ids>]}

Découpage (au moins 2 sous-étapes) :
{"split": true, "sub_steps": [{"description": "...", "duration_minutes": <entier>, "equipment_ids": [<ids>], "parallel_with_previous": <bool>}, ...]}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500 * steps.length,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Réponse IA inattendue (pas de texte).");
  }

  const parsed = parseJsonResponse<RawSuggestion[]>(block.text);
  if (parsed.length !== steps.length) {
    throw new Error(`Réponse IA incohérente : ${parsed.length} suggestion(s) pour ${steps.length} étape(s).`);
  }

  const result: Record<string, StepSuggestion> = {};
  steps.forEach((step, i) => {
    result[step.stepId] = fromRaw(parsed[i]);
  });
  return result;
}
