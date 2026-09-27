import type { Equipment, Recipe } from "./types.js";

export const equipment: Equipment[] = [
  { id: "four", name: "Four", capacity: 1 },
  { id: "feu", name: "Feux de cuisson", capacity: 2 },
  { id: "poele", name: "Poêle", capacity: 1 },
  { id: "casserole", name: "Casserole", capacity: 2 },
];

export const recipes: Recipe[] = [
  {
    id: "ratatouille",
    title: "Ratatouille",
    steps: [
      {
        id: "ratatouille:1",
        recipeId: "ratatouille",
        order: 1,
        description: "Couper les légumes",
        durationMinutes: 15,
        equipmentIds: [],
        dependsOn: [],
      },
      {
        id: "ratatouille:2",
        recipeId: "ratatouille",
        order: 2,
        description: "Faire revenir à la poêle",
        durationMinutes: 45,
        equipmentIds: ["feu", "poele"],
        dependsOn: ["ratatouille:1"],
      },
      {
        id: "ratatouille:3",
        recipeId: "ratatouille",
        order: 3,
        description: "Mijoter",
        durationMinutes: 30,
        equipmentIds: ["feu"],
        dependsOn: ["ratatouille:2"],
      },
    ],
  },
  {
    id: "riz",
    title: "Riz aux légumes",
    steps: [
      {
        id: "riz:1",
        recipeId: "riz",
        order: 1,
        description: "Rincer le riz",
        durationMinutes: 5,
        equipmentIds: [],
        dependsOn: [],
      },
      {
        id: "riz:2",
        recipeId: "riz",
        order: 2,
        description: "Cuire le riz",
        durationMinutes: 20,
        equipmentIds: ["feu", "casserole"],
        dependsOn: ["riz:1"],
      },
    ],
  },
  {
    id: "poulet",
    title: "Poulet rôti",
    steps: [
      {
        id: "poulet:1",
        recipeId: "poulet",
        order: 1,
        description: "Préparer et assaisonner le poulet",
        durationMinutes: 15,
        equipmentIds: [],
        dependsOn: [],
      },
      {
        id: "poulet:2",
        recipeId: "poulet",
        order: 2,
        description: "Cuire au four",
        durationMinutes: 60,
        equipmentIds: ["four"],
        dependsOn: ["poulet:1"],
      },
    ],
  },
];
