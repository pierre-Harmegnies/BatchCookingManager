# BatchCookingManager

Module d'ordonnancement de la préparation en batch cooking. Consomme (à terme) les recettes/menus de [MaCuisine](../MaCuisine) via son API ; se concentre uniquement sur la génération d'un planning de préparation optimisé compte tenu des contraintes matérielles (four, feux, casseroles...).

Voir le cadrage complet dans `/home/developer/.claude/plans/dans-home-developer-src-shared-batchcook-glistening-pancake.md`.

## État actuel

`src/scheduler.ts` implémente l'heuristique d'ordonnancement (Serial Schedule Generation Scheme), avec un équipement virtuel `cuisinier` (capacité 1) représentant le fait qu'une seule personne cuisine à la fois.

## Raffinement des étapes (sous-étapes)

Une étape MaCuisine trop groupée (ex: "poêler les haricots ET cuire les pâtes") peut être divisée en plusieurs sous-étapes propres à BatchCookingManager, **sans modifier la recette originale dans MaCuisine**. Dans l'écran de complétion, bouton "Diviser en sous-étapes" → liste dynamique de sous-étapes (description, durée, équipement, case "en parallèle de la précédente").

Logique de dépendances (`computeSubStepWaves` dans `src/macuisine/toDomain.ts`) : les sous-étapes consécutives marquées "parallèle" forment une même "vague" (même dépendance, exécutables en même temps) ; une sous-étape normale démarre une nouvelle vague qui dépend de **toute** la vague précédente. La première vague hérite de la dépendance externe de l'étape d'origine ; les étapes qui dépendaient de l'étape d'origine sont automatiquement rebranchées sur la **dernière** vague (pas juste la première sous-étape) — testé de bout en bout sur une vraie recette (Cookeo) et validé unitairement sur un cas de fusion parallèle.

## Revoir une recette indépendamment d'un planning

Section "Revoir une recette" en bas de page : liste toutes les recettes MaCuisine, affiche l'état de configuration de chaque étape (`GET /api/recipes/:slug/metadata`) et permet de la corriger via la même carte d'édition que l'écran de complétion (durée, équipement, dépendance, sous-étapes) — sans avoir besoin de la sélectionner dans un planning. La logique de carte a été extraite dans `createStepEditorCard(step, existingMetadata)` (`public/app.js`), réutilisée par les deux écrans, avec pré-remplissage des champs quand une configuration existe déjà.

## Identité visuelle

Alignée sur MaCuisine (`frontend/tailwind.config.js`, `Layout.tsx`, `RecipeCard.tsx`) : police Inter, fond stone-200, accent orange "cuisine" (#ee7b12), cartes blanches arrondies, icônes SVG inline façon lucide-react (pas d'emoji), pastilles de catégorie douces. La palette recette/équipement (web + PDF) reprend les teintes sky/amber/rose/teal/violet de MaCuisine.

Bouton "💡 Suggestion IA pour toute la recette" : un seul appel IA groupé (`POST /api/recipes/:slug/suggest-all`, `suggestStepMetadataBatch`) pré-remplit toutes les étapes d'un coup, au lieu d'un appel par étape — même garantie que la suggestion individuelle (jamais appliqué automatiquement, chaque étape doit être vérifiée puis enregistrée séparément). Modèle utilisé pour toute suggestion IA (individuelle ou groupée) : **`claude-haiku-4-5-20251001`** plutôt que Sonnet — tâche d'extraction structurée simple, Haiku est nettement moins cher et suffisant vu que le résultat est toujours revalidé manuellement.

## Menus MaCuisine

`GET /api/menus` (section "1. Charger un menu de la semaine" dans l'UI) liste les menus déjà planifiés dans MaCuisine et en extrait les recettes distinctes (`extractRecipesFromMenu` dans `src/macuisine/client.ts`, tous jours/repas confondus). Cliquer "Charger" présélectionne ces recettes dans le sélecteur libre ci-dessous (max 4 ; au-delà, seules les 4 premières sont cochées, à ajuster manuellement) — la sélection libre reste disponible en complément, elle n'est pas remplacée.

## Étapes indépendantes (dependsOn)

Dans l'écran de complétion, une case "Étape indépendante" permet de dire qu'une étape ne dépend pas de la précédente de la même recette (ex: une garniture préparable pendant qu'un plat mijote) — elle enregistre `dependsOn: []` au lieu du défaut (étape précédente). C'est une bascule binaire, pas un éditeur de dépendances complet : **limite connue** — si l'étape suivante avait besoin de dépendre d'une étape antérieure à celle qu'on vient de rendre indépendante (ex: étape 5 a besoin de l'étape 2 terminée, pas seulement de l'étape 4), le défaut séquentiel ne le capture pas et peut produire un planning incorrect dans ce cas précis. Détecté en testant sur une vraie recette (`tomates-crevettes-sauce-legere`). Une vraie UI de graphe de dépendances serait nécessaire pour couvrir ce cas correctement — pas fait ici, hors scope du "petit chantier".

Deux démos :
- `npm run demo` — recettes fictives (`src/mockData.ts`), aucune dépendance externe.
- `npm run demo:real` — vraies recettes MaCuisine, récupérées via `src/macuisine/client.ts` (`GET /api/recipes/{slug}`), avec équipement et métadonnées d'ordonnancement lus depuis MongoDB (base `batch_cooking`, même instance que MaCuisine). Nécessite que MaCuisine et Mongo tournent, joignables via `MACUISINE_API_URL` et `MONGODB_URL`.

La persistance (`src/store/`) est volontairement une base logique séparée (`batch_cooking`) sur la même instance Mongo que `gestion_cuisine` — décision du cadrage pour ne pas coupler les schémas des deux projets. `npm run seed` y charge l'équipement et les métadonnées actuellement définies dans `src/macuisine/sampleMetadata.ts` (en attendant le vrai écran de complétion IA + validation manuelle).

```
npm install
npm run demo
npm run seed          # charge équipement + métadonnées d'exemple dans MongoDB
npm run demo:real     # MACUISINE_API_URL=http://cuisine-api:8000 MONGODB_URL=mongodb://cuisine-mongo:27017 si lancé depuis un conteneur sur le réseau macuisine_default
npm run typecheck
```

**Note d'environnement** : si BatchCookingManager tourne dans un conteneur séparé de MaCuisine, il doit être sur le même réseau Docker (`docker network connect macuisine_default <conteneur>`) pour résoudre `cuisine-api`. C'est la configuration prévue pour la suite (même réseau, même instance MongoDB).

## Interface web

`npm run server` lance une API Express + une page web statique (`public/`) :

- Sélection de jusqu'à 4 recettes (recherche incluse)
- Génération du planning ; si des étapes n'ont pas encore de durée/équipement, un écran de complétion s'affiche à la place, avec un bouton **Suggérer via IA** par étape (Claude, `ANTHROPIC_API_KEY`) — la suggestion pré-remplit le formulaire mais doit être validée manuellement avant enregistrement, jamais appliquée automatiquement
- Une fois toutes les étapes complétées, le planning s'affiche sous forme de tableau chronologique

```
PORT=3001 MACUISINE_API_URL=http://cuisine-api:8000 MONGODB_URL=mongodb://cuisine-mongo:27017 npm run server
```

Endpoints : `GET /api/recipes`, `GET /api/equipment`, `GET /api/planning?slugs=a,b,c`, `POST /api/step-metadata`, `POST /api/step-metadata/suggest`, `GET /api/planning/pdf?slugs=a,b,c`.

## Export PDF

`GET /api/planning/pdf?slugs=a,b,c` (bouton "Télécharger en PDF" dans l'UI une fois le planning généré) produit un pas-à-pas imprimable inspiré des fiches batch cooking classiques (`src/pdf/planningPdf.ts`, `pdfkit`) : liste chronologique unique toutes recettes confondues, case à cocher par étape, code couleur par recette (légende en en-tête), équipement affiché en regard de chaque étape, durée totale en évidence. Répond 409 avec le détail si des métadonnées manquent encore.

## Prochaines étapes

- Persister aussi les `dependsOn` personnalisés depuis l'UI (actuellement seule la durée + l'équipement sont éditables dans le formulaire de complétion, le `dependsOn` par défaut — étape précédente — s'applique).
- Gestion des menus (max 4) plutôt qu'une sélection libre de recettes.
- Déploiement Docker de BatchCookingManager aux côtés de MaCuisine (actuellement lancé manuellement en dev, sur le réseau `macuisine_default`).
