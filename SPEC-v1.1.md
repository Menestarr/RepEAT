# SPEC v1.1 : unités ménagères, arrondis cohérents, brouillons

Complète [SPEC.md](SPEC.md) (v1). Seuls les points modifiés ou ajoutés sont décrits ici ; tout le reste de la v1 s'applique.

## 1. Objectifs

1. Supprimer l'historique de saisie du navigateur sur les champs de nom.
2. Saisir les ingrédients dans des unités ménagères (cuillères, unités de fruit, etc.) en plus de g et ml.
3. Arrondir les quantités affichées pour une portion à des valeurs réalistes (pas 1/3 d'avocat, pas 37 g).
4. Ne plus perdre une recette en cours de saisie quand on quitte l'écran (ex. pour compléter un aliment).

## 2. Décisions actées

| Sujet | Décision |
|---|---|
| Autocomplétion | `autocomplete="off"` sur tous les champs texte libres (noms de recette, d'aliment, de phase, de modèle). |
| Unités | `g`, `ml`, `cac` (cuillère à café, 5 ml), `cas` (cuillère à soupe, 15 ml), `u` (unité : fruit, œuf, tranche…), `pincee` (0,5 g). |
| Cuillères | Unités de volume, converties en grammes par la densité de l'aliment (défaut 1). Arrondies à la ½ c. à café (voir 5.2). |
| Unité `u` | Réservée aux aliments ayant un poids unitaire. Proposée par défaut à l'ajout de ces aliments. |
| Arrondi des grammes | Au gramme près sous 100 g, au pas de 5 g à partir de 100 g (idem en ml). |
| Fruits en grammes | Toujours possibles. Le poids d'une unité est rappelé entre parenthèses : « 180 g (1 avocat = 140 g) ». |
| Arrondi des unités | Le pas de l'aliment est le grain minimal qu'on accepte de prendre : 0,5 pour tous les fruits, 1 pour l'œuf. Cuillères : ½ c. à café. |
| Cuillères à l'affichage | Arrondi à la ½ c. à café, puis regroupé en c. à soupe (ex. « 1 c. à soupe + ½ c. à café »). |
| Huile de cuisson | La recette « Huile d'olive » est saisie en cuillères. |
| Saisie des kcal | Dans la composition du jour, on peut taper un nombre de kcal par recette au lieu d'utiliser +/-. |
| Arrondi à zéro | Jamais : une quantité non nulle s'arrondit au moins à un pas. |
| Brouillon | Enregistré en continu dans IndexedDB (pas seulement en quittant l'écran), restauré automatiquement au retour. |

## 3. Historique de saisie dans les champs de nom

- Ajouter `autocomplete="off"` sur : nom de recette ([RecipeEdit.svelte](src/ui/screens/RecipeEdit.svelte)), nom d'aliment ([FoodEdit.svelte](src/ui/screens/FoodEdit.svelte)), nom de phase ([Phases.svelte](src/ui/screens/Phases.svelte)), nom de modèle ([Day.svelte](src/ui/screens/Day.svelte)).
- Ajouter aussi `autocorrect="off"` et `spellcheck="false"` uniquement sur les champs de recherche (déjà en `autocomplete="off"`). Sur les champs de nom, garder la correction orthographique iOS, utile pour les noms.
- À vérifier sur iPhone : Safari ignore parfois `autocomplete="off"`. Si les suggestions persistent, utiliser un `name` non standard (ex. `name="recipe-title-x"`), qui empêche Safari de rapprocher le champ d'un historique.

## 4. Unités de mesure

### 4.1 Liste

| Code | Libellé affiché | Conversion en grammes | Usage typique |
|---|---|---|---|
| `g` | g | `quantity` | cas général |
| `ml` | ml | `quantity × densité` | lait, liquides |
| `cac` | c. à café | `quantity × 5 × densité` | huile, miel, sel, épices |
| `cas` | c. à soupe | `quantity × 15 × densité` | huile, crème, sauces, farine |
| `u` | unité (ou libellé de l'aliment, ex. « avocat ») | `quantity × unit_weight_g` | fruits, œufs, tranches de pain, yaourts |
| `pincee` | pincée | `quantity × 0,5` | sel, épices (kcal négligeables) |

Écartées : verre, tasse, bol, poignée. Trop variables d'un foyer à l'autre pour une app dont le but est la précision à 100 kcal près. `cl` n'apporte rien par rapport à `ml`.

### 4.2 Densité des poudres

Une cuillère de farine ne pèse pas 15 g. La densité existante (`density_g_ml`) sert aussi aux cuillères : pour la farine ~0,55, le sucre ~0,85, le cacao ~0,45. Le champ densité de l'écran Aliment affiche, à côté, le poids calculé d'une c. à soupe (« 1 c. à soupe = 8 g ») pour que la valeur soit vérifiable. Valeur pré-remplie à la création depuis Ciqual : 0,92 pour les huiles (existant), 1 sinon.

### 4.3 Unités de fruit

- `Food` gagne deux champs :
  - `unit_label?: string` : libellé de l'unité au singulier (« avocat », « œuf », « tranche »). Défaut : « unité ».
  - `unit_step?: 0.5 | 1` : pas d'arrondi en unités. Défaut 1.
- `unit_weight_g` est le poids **de la partie comestible** (Ciqual est exprimé pour 100 g de partie comestible). L'écran Aliment l'indique explicitement : « Poids sans peau ni noyau ».
- Pré-remplissage : une petite table embarquée (`src/domain/unitDefaults.ts`) associe des motifs de nom normalisé à des valeurs par défaut, appliquées à la copie d'un aliment Ciqual. Liste initiale (à ajuster à l'usage) :

| Aliment | Poids comestible | Pas | Libellé |
|---|---|---|---|
| Avocat | 140 g | 0,5 | avocat |
| Banane | 120 g | 0,5 | banane |
| Pomme | 150 g | 0,5 | pomme |
| Poire | 150 g | 0,5 | poire |
| Orange | 140 g | 0,5 | orange |
| Clémentine, mandarine | 60 g | 0,5 | clémentine |
| Kiwi | 75 g | 0,5 | kiwi |
| Pêche, nectarine | 130 g | 0,5 | pêche |
| Abricot | 40 g | 0,5 | abricot |
| Œuf (entier) | 50 g | 1 | œuf |

  **Œuf** : les œufs ne sont pas en `0204`, ils ont une règle propre (vérifiée dans `alim_2025_11_03.xml`, où aucun nom ne contient « entier »). Sous-groupe `0410`, premier mot « Oeuf » (même règle de tokens que la recherche Ciqual), et aucun des mots « blanc », « jaune », « poudre », « caille », « cane », « oie », « dinde », « brouillé ». Reconnus : « Oeuf cru », « Oeuf dur », « Oeuf à la coque », « Oeuf poché », « Oeuf au plat ». Exclus : « Oeuf, jaune (jaune d'oeuf), cru », « Oeuf, blanc… », « Oeuf de caille, cru », « Oeuf, en poudre ».

  **Martinique** : les fruits « prélevés à la Martinique » (« Pomme cannelle », « Pomme cajou », « Abricot pays »…) reçoivent le pas 0,5 mais pas le poids de la liste, qui ne leur correspond pas.

  Règle : tout fruit frais de Ciqual reçoit le pas 0,5 par défaut, même hors de cette liste (le poids unitaire reste alors à saisir). Le pas est le grain minimal : une quantité ne s'affiche jamais plus finement que lui.

- **Reconnaître un fruit frais** (vérifié dans `alim_2025_11_03.xml`) :
  - Le sous-groupe Ciqual `0204` (fruits) est la condition principale. Il exclut les « Pomme de terre… » (`0202`, légumes), qu'un motif « pomme » attraperait sinon.
  - Le nom doit contenir « cru » ou « crue » et ne pas contenir « sèche » ni « séché » : « Banane, sèche » et « Pomme, séchée » sont aussi en `0204`, mais se pèsent.
  - Le motif doit être le premier mot du nom, d'où l'exclusion de « Compote de pomme » et « Jus d'orange ».
  - Exception : l'avocat est classé en `0201` (légumes) par Ciqual. Il est reconnu par son nom seul (« Avocat, chair… »).
- **Format du JSON Ciqual** : le JSON compact ne contient pas le sous-groupe aujourd'hui. On ajoute `alim_ssgrp_code` : `[code, nom, nom_normalisé, kcal, prot, gluc, lip, flags, ssgrp]`. Il faut régénérer `public/ciqual-2025.json` et mettre à jour les tests du script.
- **Aliments déjà copiés** : la v1 a pu copier des fruits dans `foods` sans ces valeurs, et le pré-remplissage ne joue qu'à la copie. Si l'aliment correspond à un motif mais n'a pas de poids unitaire, l'écran Aliment propose un bouton « Utiliser les valeurs indicatives (1 avocat = 140 g) ». Pas de modification automatique : l'aliment changerait, et des nouvelles versions de recettes seraient proposées sans action de l'utilisateur. Pour un aliment copié en v1, le sous-groupe n'est pas stocké : la correspondance se fait par le code Ciqual, relu dans le JSON embarqué.

  Les valeurs pré-remplies restent modifiables et sont signalées « valeur indicative » jusqu'à la première modification manuelle. Aucune donnée n'est inventée pour un aliment hors de la liste.
- Un aliment avec poids unitaire peut toujours être saisi en g dans une recette (utile pour une banane pesée). Partout où il s'affiche en g (saisie de la recette, tableau des portions, feuille du jour, liste agrégée), le poids d'une unité suit entre parenthèses : « 180 g (1 avocat = 140 g) ».
- `is_unit_item` devient dérivé : vrai si `unit_weight_g > 0`. Le champ reste stocké pour compatibilité, synchronisé à l'écriture.

### 4.4 Modèle de données

```ts
type Unit = 'g' | 'ml' | 'cac' | 'cas' | 'u' | 'pincee';

type Food = { /* v1 */ unit_label?: string; unit_step?: 0.5 | 1; };

type FoodSnapshot = Pick<Food, /* v1 */ | 'unit_label' | 'unit_step'>;

type RecipeVersion = { /* v1 */ lines: { /* v1 */ unit: Unit }[] };
```

- Les versions v1 existantes restent valides (sous-ensemble `g | ml`). Aucune réécriture des versions, elles sont immuables.
- Validation : `unit = 'u'` interdit si le snapshot n'a pas de `unit_weight_g > 0`.
- Export : `SCHEMA_VERSION` passe à 2. Migration 1 → 2 sans transformation (ajout de champs optionnels). Un fichier v2 est refusé par une app v1, comportement déjà prévu.

### 4.5 Saisie dans une recette

- Sélecteur d'unité par ligne, ne proposant que les unités pertinentes : `u` seulement si l'aliment a un poids unitaire ; `pincee` toujours en dernier.
- Unité par défaut à l'ajout : `u` si poids unitaire, `cas` si le nom contient « huile », sinon `g`.
- Quantité : décimales acceptées (« 1,5 » c. à soupe, « 0,5 » avocat).

## 5. Arrondis cohérents

### 5.1 Principe

Les calculs restent en flottants (v1). L'arrondi s'applique **à l'affichage d'une quantité pour N blocs** : tableau des portions de la recette, composition du jour, feuille du jour. Il remplace l'arrondi « à l'unité » de la v1.

L'ingrédient est affiché dans **l'unité de saisie** de la ligne (comme en v1 pour ml), arrondi au pas de cette unité.

### 5.2 Pas par unité

| Unité | Pas | Exemple |
|---|---|---|
| `g`, `ml` | 1 si la quantité exacte < 100, sinon 5 | 37,2 g → 37 g ; 143 g → 145 g |
| `cac`, `cas` | ½ c. à café (2,5 ml) | 1,3 c. à soupe = 3,9 c. à café → 4 → « 1 c. à soupe + 1 c. à café » |
| `u` | `unit_step` de l'aliment (0,5 ou 1) | 0,33 avocat → 0,5 ; 1,4 œuf → 1 |
| `pincee` | 1 | |

Règles :

```
step(line, exact)     = selon le tableau ci-dessus
rounded(line, N)      = max(step, round(exact / step) * step)   si exact > 0
rounded_grams(line,N) = conversion en grammes de rounded(line, N)
rounding_delta_kcal   = (rounded_grams - grams_for) * kcal_100g / 100
```

- `round` : arrondi au plus proche, demi vers le haut.
- Le plancher à un pas remplace le signalement « 0 g » de la v1 : on n'affiche jamais 0. Si l'arrondi au plancher dépasse la quantité exacte de plus de 50 % (ex. 0,2 avocat → 0,5), l'ingrédient est signalé « arrondi fort » avec son écart en kcal.
- Affichage des demis : « ½ avocat », « 1 ½ c. à soupe », pas « 0,5 ».
- Cuillères : quelle que soit l'unité de saisie (`cac` ou `cas`), la quantité exacte est convertie en c. à café et arrondie à la ½ c. à café. Elle est ensuite décomposée : c. à soupe = partie entière de (c. à café / 3), le reste en c. à café. Exemples : 2 ½ c. à café ; 1 c. à soupe + ½ c. à café ; 2 c. à soupe. Raison : ½ c. à soupe d'huile vaut ≈ 60 kcal, un pas trop grossier, alors que ½ c. à café vaut ≈ 20 kcal.

### 5.2 bis Huile de cuisson

La recette à un ingrédient « Huile d'olive » (v1 : ~11 g par bloc) est saisie en c. à soupe. Pour une huile de densité 0,92 (≈ 900 kcal/100 g) :

| Blocs | Exact | Affiché | Écart |
|---|---|---|---|
| 0,5 | 1,2 c. à café | 1 c. à café | −9 kcal |
| 1 | 2,4 c. à café | 2 ½ c. à café | +4 kcal |
| 1,5 | 3,6 c. à café | 1 c. à soupe + ½ c. à café | −5 kcal |
| 2 | 4,8 c. à café | 1 c. à soupe + 2 c. à café | +7 kcal |

L'écart reste sous 10 kcal, acceptable. La migration de la recette existante se fait à la main : l'app ne réécrit pas les recettes de l'utilisateur.

### 5.3 Écart d'arrondi

- Écart par ingrédient et total par recette pour N blocs, en kcal, affichés comme en v1 (désormais pour tous les ingrédients, pas seulement ceux à l'unité).
- Compteur du jour : l'écart total d'arrondi de la journée s'affiche sous le reste (« Arrondis : +23 kcal »). Le reste en blocs n'en tient pas compte : les blocs restent la référence, l'écart est informatif.
- Pas de compensation automatique entre ingrédients en v1.1 (ex. retirer 5 g de riz pour compenser le ½ avocat). Voir section 9.

### 5.4 Feuille du jour, liste agrégée

La liste agrégée par aliment additionne les quantités **arrondies** de chaque recette (c'est ce qu'on pèse), **par unité d'origine**, sans conversion entre unités. Un aliment apparaît sur une seule ligne qui juxtapose les totaux par unité : « 2 c. à soupe + 20 g », « 1 avocat + 60 g ». Les cuillères (`cac` et `cas`) sont additionnées ensemble en c. à café, puis décomposées comme en 5.2. Chaque total est une somme de valeurs déjà arrondies : il n'est pas réarrondi.

## 6. Brouillons de recette

### 6.1 Comportement

Le brouillon couvre **toute sortie de l'écran Recette**, quelle qu'en soit la cause : autre onglet, bouton Précédent, lien vers un aliment, passage en arrière-plan, fermeture ou plantage de l'app, rechargement après une mise à jour. Le cas de l'aliment à compléter (6.2) n'est qu'un cas particulier, qui ajoute le retour automatique.

- Chaque modification de l'écran Recette (nom, catégorie, lignes, quantités, unités) enregistre un brouillon, avec un délai de 500 ms après la dernière frappe, et immédiatement sur `pagehide` / `visibilitychange` (hidden). L'enregistrement continu est nécessaire : iOS peut tuer l'app en arrière-plan sans déclencher d'événement de sortie.
- En revenant sur l'écran, le brouillon est restauré automatiquement, avec un bandeau : « Brouillon restauré (modifié il y a 3 min) · Abandonner ».
- « Abandonner » supprime le brouillon et recharge la version courante (ou un formulaire vide pour une nouvelle recette), après confirmation.
- Enregistrer la recette supprime le brouillon dans la même transaction que la création de version.
- Les lignes du brouillon stockent `food_id`, pas de snapshot : à la restauration, chaque aliment est relu depuis la base. Un aliment complété entre-temps (kcal ajoutées) est donc à jour sans action. Un aliment supprimé est retiré du brouillon, avec un message. Si l'aliment n'a plus de poids unitaire alors que la ligne est en `u`, la ligne est signalée et repasse en `g` : mieux vaut une valeur imprécise que pas de valeur. La quantité saisie est conservée, le poids unitaire précédent n'étant plus connu, l'utilisateur la corrige.
- La confirmation « modifications non enregistrées » à la sortie de l'écran (`editing.dirty`) est supprimée pour les recettes : plus rien ne se perd. Elle reste pour les autres écrans.

### 6.2 Aller compléter un aliment et revenir

- Le lien « kcal manquant : compléter » ouvre l'écran Aliment avec un paramètre de retour (`/aliment/:id?retour=/recette/:rid`).
- Nouvelle recette : l'identifiant du brouillon est placé dans l'URL dès l'ouverture (`/recette/new?brouillon=<id>`, en remplaçant l'entrée d'historique). Le retour depuis l'écran Aliment et le bouton Précédent d'iOS retrouvent ainsi le bon brouillon. Le retour vaut `retour=/recette/new?brouillon=<id>`, encodé.
- Le paramètre `retour` n'accepte qu'un chemin interne commençant par `/`. Sinon il est ignoré, et l'écran revient à la liste des aliments.
- Après « Enregistrer » sur l'aliment, retour automatique à la recette, brouillon restauré, aliment à jour.
- Même mécanisme depuis le sélecteur d'aliments : « Créer un aliment personnalisé » depuis une recette revient à la recette avec l'aliment ajouté en nouvelle ligne.

### 6.3 Liste des brouillons

- Catalogue : une recette ayant un brouillon porte un badge « brouillon ». Les nouvelles recettes non enregistrées apparaissent en tête de liste sous « Brouillons », avec leur nom provisoire ou « Sans nom ». Les brouillons sans nom sont numérotés comme dans un explorateur de fichiers : « Sans nom », « Sans nom (1) », « Sans nom (2)… ». Un brouillon est créé dès l'ouverture de « Nouvelle recette », même vide ; la purge à 30 jours (6.4) évite l'accumulation.
- Plusieurs nouvelles recettes peuvent être en brouillon en parallèle (identifiant de brouillon généré à l'ouverture de « Nouvelle recette »).

### 6.4 Modèle de données

```ts
type RecipeDraft = {
  id: string;                 // = recipe_id pour une recette existante, uuid sinon
  recipe_id?: string;         // absent pour une nouvelle recette
  base_version_id?: string;   // version courante à l'ouverture du brouillon
  name: string;
  category: Recipe['category'];
  lines: { food_id: string; quantity: string; unit: Unit }[]; // quantity brute, telle que saisie
  updated_at: string;
};
```

- Nouvelle table Dexie `recipeDrafts: id, recipe_id, updated_at`, via `db.version(2)` avec un test de migration (règle v1).
- Les brouillons sont **locaux à l'appareil** : ni exportés, ni importés, ni fusionnés.
- Conflit : si, à la restauration, la version courante de la recette n'est plus `base_version_id` (nouvelle version venue d'un import), le bandeau le signale : « La recette a changé depuis ce brouillon » avec « Garder mon brouillon » / « Abandonner ».
- Purge : un brouillon de plus de 30 jours est supprimé au démarrage.

## 6 bis. Saisie des kcal dans la composition du jour

### 6 bis.1 Comportement

- Sur chaque recette de la composition du jour, la valeur entre les boutons − et + devient un champ éditable. Il affiche les kcal (« 250 kcal ») et, en dessous, les blocs (« 2,5 blocs »).
- Un appui sur la valeur ouvre le clavier numérique (`inputmode="numeric"`) avec la valeur sélectionnée, pour la remplacer directement.
- Validation par « OK » du clavier, perte du focus ou Entrée. Échap ou valeur vide : retour à la valeur précédente.
- La valeur saisie est arrondie au demi-bloc le plus proche (50 kcal), car `blocks` reste un multiple de 0,5 (règle v1) : 230 → 250 kcal, 220 → 200 kcal. Si la valeur est modifiée par l'arrondi, un message bref l'indique (« arrondi à 250 kcal »).
- 0 retire la recette de la journée. Une valeur négative ou non numérique est refusée, l'ancienne valeur est conservée.
- Les boutons +/- restent, au pas de 50 kcal.
- Ajout d'une recette depuis la recherche : même champ, pré-rempli à 100 kcal.
- Journée validée : champ en lecture seule (règle v1).

### 6 bis.2 Raccourci « compléter le reste »

Si le reste du jour est positif, un bouton « = reste » à côté du champ fixe la recette à sa valeur actuelle + le reste, arrondi au demi-bloc inférieur. Exemple : reste 320 kcal, recette à 200 → 500 kcal.

### 6 bis.3 Modèle de données

Aucun changement : on stocke toujours `blocks`. Conversion `blocks = round(kcal / 50) / 2`.

## 7. Tests

- Calcul : conversion de chaque unité en grammes (avec et sans densité), pas d'arrondi par unité, plancher à un pas, demi vers le haut, signalement « arrondi fort », écart d'arrondi en kcal, liste agrégée sur quantités arrondies.
- Validation : `u` refusé sans poids unitaire ; versions v1 (g, ml) toujours valides.
- Export : migration de schéma 1 → 2 ; import d'un fichier v1 dans l'app v1.1.
- Dexie : migration `version(2)` sur une base v1 peuplée ; brouillons absents de l'export complet ; numérotation « Sans nom (n) » ; ligne `u` repassée en `g` et signalée si l'aliment a perdu son poids unitaire. Liste agrégée : « 2 c. à soupe + 20 g » sans conversion entre unités. Œuf : « Œuf, jaune, cru » exclu du pré-remplissage.
- Brouillons : sauvegarde, restauration avec aliment complété entre-temps, suppression à l'enregistrement (même transaction), aliment supprimé, détection de changement de version, purge à 30 jours.
- Grammes : seuil de 100 g (99,6 g → 100 g, puis pas de 5 au-delà) ; mention « (1 avocat = 140 g) » sur un aliment à l'unité saisi en g.
- Cuillères : arrondi à la ½ c. à café, décomposition en c. à soupe + c. à café, tableau de l'huile (section 5.2 bis).
- Saisie des kcal : arrondi au demi-bloc (230 → 2,5 ; 220 → 2), 0 retire l'entrée, valeurs invalides refusées, « = reste ».
- Pré-remplissage : pas 0,5 pour tout fruit frais `0204` ; exclus : « Pomme de terre », « Banane, sèche », « Compote de pomme », « Jus d'orange » ; avocat reconnu malgré `0201` ; bouton « valeurs indicatives » sur un aliment copié en v1 ; correspondance des motifs (« Avocat, pulpe, cru » → avocat ; « Bœuf » ne déclenche pas « œuf », même règle de tokens que la recherche Ciqual).

## 8. Ordre d'implémentation

1. Autocomplétion (section 3), indépendant et immédiat.
2. Domaine : type `Unit`, conversions, arrondis, écart (sections 4.4, 5) avec tests.
3. Données : champs `Food`, schéma d'export 2, table `recipeDrafts` et migration Dexie. Ciqual : sous-groupe dans le JSON, régénération.
4. UI Aliment : libellé, pas et poids d'unité, poids d'une cuillère ; table de pré-remplissage.
5. UI Recette : sélecteur d'unité, brouillons, retour depuis l'écran Aliment.
6. Affichage arrondi : tableau des portions, composition du jour, feuille du jour, liste agrégée.
7. Saisie des kcal dans la composition du jour (section 6 bis).
8. Vérification sur iPhone : autocomplétion, brouillon après mise en arrière-plan et fermeture forcée de l'app.

## 9. Hors v1.1

- Compensation automatique des arrondis entre ingrédients d'une recette, pour coller à N blocs.
- Pas d'arrondi réglable par aliment pour les grammes (ex. riz à 10 g près).
- Brouillons pour les autres écrans (Aliment, Phase) : formulaires courts, le besoin n'est pas avéré.

## 10. Questions ouvertes

- Aucune pour l'instant.
