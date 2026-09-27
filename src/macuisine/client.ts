export interface MaCuisineStep {
  id: string;
  order: number;
  description: string;
}

export interface MaCuisineRecipe {
  /** MaCuisine sérialise l'id Mongo sous `_id`, pas `id`. */
  _id: string;
  slug: string;
  title: string;
  steps: MaCuisineStep[];
}

const BASE_URL = process.env.MACUISINE_API_URL ?? "http://localhost:8000";

export async function fetchRecipeBySlug(slug: string): Promise<MaCuisineRecipe> {
  const res = await fetch(`${BASE_URL}/api/recipes/${slug}`);
  if (!res.ok) {
    throw new Error(`Échec de récupération de la recette '${slug}': HTTP ${res.status}`);
  }
  return (await res.json()) as MaCuisineRecipe;
}

export interface RecipeSummary {
  slug: string;
  title: string;
  category?: string;
}

export async function fetchRecipeList(): Promise<RecipeSummary[]> {
  const res = await fetch(`${BASE_URL}/api/recipes?limit=500`);
  if (!res.ok) {
    throw new Error(`Échec de récupération des recettes: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { recipes: RecipeSummary[]; total: number };
  return data.recipes;
}

interface MaCuisineMenuItem {
  recipe_slug: string | null;
  recipe_title: string | null;
  custom_text: string | null;
}

interface MaCuisineMenuSlot {
  items: MaCuisineMenuItem[];
}

export interface MaCuisineMenu {
  _id: string;
  name: string;
  week_start: string | null;
  slots: Record<string, Record<string, MaCuisineMenuSlot>>;
}

export async function fetchMenuList(): Promise<MaCuisineMenu[]> {
  const res = await fetch(`${BASE_URL}/api/menus`);
  if (!res.ok) {
    throw new Error(`Échec de récupération des menus: HTTP ${res.status}`);
  }
  return (await res.json()) as MaCuisineMenu[];
}

/** Recettes distinctes (avec slug) référencées dans un menu MaCuisine, tous jours/repas confondus. */
export function extractRecipesFromMenu(menu: MaCuisineMenu): RecipeSummary[] {
  const bySlug = new Map<string, RecipeSummary>();
  for (const day of Object.values(menu.slots)) {
    for (const slot of Object.values(day)) {
      for (const item of slot.items) {
        if (item.recipe_slug && !bySlug.has(item.recipe_slug)) {
          bySlug.set(item.recipe_slug, { slug: item.recipe_slug, title: item.recipe_title ?? item.recipe_slug });
        }
      }
    }
  }
  return [...bySlug.values()];
}
