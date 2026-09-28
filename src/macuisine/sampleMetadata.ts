import type { Equipment } from "../types.js";

/**
 * Équipement de cuisine. `cuisinier` est un équipement virtuel de capacité 1 :
 * il représente le fait qu'une seule personne cuisine (usage perso mono-utilisateur),
 * donc deux étapes nécessitant une présence active (hacher, mélanger, surveiller...)
 * ne peuvent jamais être planifiées en simultané, même si les appareils utilisés
 * sont différents.
 */
export const equipment: Equipment[] = [
  { id: "airfryer", name: "Airfryer", capacity: 1 },
  { id: "cookeo", name: "Cookeo Infinity", capacity: 1 },
  { id: "cookeo_mini", name: "Cookeo Mini", capacity: 1 },
  { id: "feu", name: "Feux de cuisson", capacity: 2 },
  { id: "cuisinier", name: "Cuisinier (vous)", capacity: 1 },
];

export interface SubStepMetadata {
  /** Unique seulement au sein du step parent (ex: "a", "b", "c"). */
  id: string;
  description: string;
  durationMinutes: number;
  equipmentIds: string[];
  /**
   * Si vrai, cette sous-étape se fait en parallèle de la précédente (même
   * dépendance qu'elle) plutôt qu'après elle. Permet de représenter une étape
   * MaCuisine trop groupée (ex: "poêler les haricots ET cuire les pâtes")
   * comme deux actions distinctes et parallélisables pour l'ordonnancement.
   */
  parallelWithPrevious?: boolean;
}

export interface StepMetadata {
  durationMinutes: number;
  /** Équipements requis, y compris `cuisinier` si l'étape demande une présence active. */
  equipmentIds: string[];
  /**
   * Ids d'étapes devant être terminées avant celle-ci. Si absent, la valeur par
   * défaut (étape précédente de la même recette) est utilisée par `toDomainRecipe`.
   */
  dependsOn?: string[];
  /**
   * Si renseigné (non vide), cette étape MaCuisine est raffinée en plusieurs
   * sous-étapes propres à BatchCookingManager pour l'ordonnancement — la
   * recette originale dans MaCuisine n'est pas modifiée. `durationMinutes` et
   * `equipmentIds` ci-dessus sont alors ignorés par le scheduler au profit des
   * sous-étapes. Voir `toDomainRecipe` pour la logique d'éclatement/rebranchement.
   */
  subSteps?: SubStepMetadata[];
}

/**
 * Métadonnées d'ordonnancement saisies "à la main" pour ce prototype, en
 * attendant l'écran de complétion (suggestion IA + validation manuelle) décrit
 * dans le cadrage. Clé = id de step MaCuisine (UUID stable).
 */
export const stepMetadataById: Record<string, StepMetadata> = {
  // Poulet Mariné Tomate, Yaourt & Moutarde à l'Airfryer
  "5c8e2b64-1b86-44fa-aecd-e765aeb787d4": { durationMinutes: 5, equipmentIds: ["cuisinier"] },
  "6321cfc7-974a-4802-b73b-19c938d7f360": { durationMinutes: 15, equipmentIds: [] },
  "c397de0c-518e-498c-b6de-8143564a4da9": { durationMinutes: 12, equipmentIds: ["airfryer"] },
  "92a949ec-791b-43ff-bc85-9af387a0d0ab": {
    durationMinutes: 15,
    equipmentIds: ["feu", "cuisinier"],
    dependsOn: [], // indépendant de la marinade, peut être préparé pendant ce temps
  },

  // Boulettes sauce tomate au Cookeo
  "274af715-fbf0-4be4-8be0-24cdd443cb76": { durationMinutes: 15, equipmentIds: ["cuisinier"] },
  "5d526fde-ed23-405a-8875-678ae68113dc": { durationMinutes: 8, equipmentIds: ["cookeo", "cuisinier"] },
  "70dba24c-16ae-44a8-9adc-a33092f98d2c": {
    durationMinutes: 20,
    equipmentIds: ["cookeo"],
    dependsOn: ["274af715-fbf0-4be4-8be0-24cdd443cb76", "5d526fde-ed23-405a-8875-678ae68113dc"],
  },
  "4c0dd063-d314-44db-aa2f-df31022d2e11": { durationMinutes: 3, equipmentIds: ["cookeo", "cuisinier"] },
  "458ce8ca-7ab9-400e-b11a-d6767941e0a7": { durationMinutes: 5, equipmentIds: ["cuisinier"] },

  // Goulasch léger de bœuf au paprika, pommes de terre vapeur
  "d0e6402c-5b53-40ad-b397-fbc1b08dba64": { durationMinutes: 8, equipmentIds: ["cookeo", "cuisinier"] },
  "62e510f7-b871-452a-88ee-d838d41a8003": { durationMinutes: 35, equipmentIds: ["cookeo"] },
  "67d16c04-a2e2-429b-a682-e18e8f0e168d": {
    durationMinutes: 15,
    equipmentIds: ["feu", "cuisinier"],
    dependsOn: [], // "pendant ce temps" : explicitement en parallèle de la cuisson sous pression
  },
  "c0f41c93-82a1-4590-88b2-7989c8203c4e": { durationMinutes: 3, equipmentIds: ["cookeo", "cuisinier"] },
  "7d3c3fda-ce14-4316-bef6-7ca2072ef2b1": { durationMinutes: 5, equipmentIds: ["cuisinier"] },
};
