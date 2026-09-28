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

const EQUIPMENT_RESERVATION_INSTRUCTIONS = `Attention à l'équipement "en réserve" : si le texte indique qu'un appareil est encore en cours d'utilisation pendant cette étape alors que l'action décrite ne le touche pas directement (ex: "pendant la cuisson du Cookeo", "four toujours allumé", "le riz continue de cuire"...), inclus quand même cet appareil dans equipment_ids (et dans equipment_ids de chaque sous-étape concernée si tu découpes). Il reste physiquement occupé et indisponible pour une autre recette tant qu'il n'a pas été explicitement libéré (ex: "retirer du Cookeo", "sortir du four", "ouvrir la cocotte").`;

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
 * Suggestion IA pour TOUTES les étapes d'une recette en un seul appel.
 * Sciemment la SEULE façon de déclencher une suggestion (pas de suggestion
 * étape par étape) : voir toutes les étapes de la recette d'un coup permet au
 * modèle de repérer les réservations d'équipement implicites (ex: un Cookeo
 * encore occupé par une cuisson lancée plus tôt), ce qu'une suggestion
 * isolée par étape ne peut pas faire de façon fiable. Un seul aller-retour à
 * l'API limite aussi le coût. Jamais appliqué automatiquement — validation
 * manuelle requise avant enregistrement (voir POST /api/step-metadata).
 */
export async function suggestStepMetadataBatch(
  steps: { stepId: string; description: string }[],
  availableEquipment: { id: string; name: string }[],
  recipeTitle?: string,
): Promise<Record<string, StepSuggestion>> {
  if (steps.length === 0) return {};

  const client = getClient();
  const equipmentList = buildEquipmentList(availableEquipment);
  const stepsList = steps.map((s, i) => `${i}. """${s.description}"""`).join("\n");
  const titleLine = recipeTitle ? `Titre de la recette : """${recipeTitle}"""\n\n` : "";

  const prompt = `${titleLine}Voici les étapes d'une recette de cuisine, numérotées :
${stepsList}

Équipements disponibles (utilise uniquement ces ids) :
${equipmentList}

Pour CHAQUE étape (dans l'ordre, une entrée par étape), décide si elle doit être découpée ou traitée comme une seule action.

Si plusieurs équipements de la liste sont des variantes du même type d'appareil (ex: "cookeo" et "cookeo_mini"), utilise le titre de la recette et le texte des étapes pour choisir la bonne variante — ne mets pas systématiquement la même par défaut.

${EQUIPMENT_RESERVATION_INSTRUCTIONS}
Comme tu vois toutes les étapes de la recette : si une étape antérieure lance une cuisson longue dans un appareil (cuisson sous pression, four...) et qu'aucune étape intermédiaire n'indique explicitement que cet appareil est libéré (retiré, ouvert, sorti...), considère qu'il reste occupé pour toutes les étapes intermédiaires — même celles qui utilisent un autre équipement en parallèle (ex: préparer un accompagnement à la poêle pendant qu'un plat cuit au Cookeo) — et inclus-le dans leur equipment_ids.

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
