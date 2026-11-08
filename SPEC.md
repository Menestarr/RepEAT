# SPEC v1 : planification de repas par blocs de 100 kcal

Document de référence du projet. Toute décision qui le contredit doit d'abord le modifier.

## 1. Objectif

Composer chaque jour ses repas à partir d'un catalogue de recettes personnelles, par blocs de 100 kcal, jusqu'à une cible calorique. L'app produit les grammes (ou ml) à peser pour chaque ingrédient.

Utilisateurs : 2 personnes. Catalogue partagé par fichier, données de journée personnelles.

## 2. Décisions actées

- PWA installable sur iPhone (Safari, "Sur l'écran d'accueil"), utilisable sur ordinateur dans un navigateur.
- Stockage local uniquement (IndexedDB), sans serveur ni compte.
- Transfert et sauvegarde : export/import JSON manuel (feuille de partage iOS, Fichiers, AirDrop, Google Drive via l'app Drive dans Fichiers).
- Usage type : catalogue géré sur ordinateur, journées sur téléphone.
- Pesée en cru, portion par portion.
- Bloc = 100 kcal, pas de 0,5 bloc (50 kcal).
- Unités de saisie : g et ml.
- Recettes versionnées, historique jamais recalculé.
- Hébergement statique : GitHub Pages.
- Huile de cuisson : comptée à 100 %, aucune fonctionnalité dédiée (voir 4.2).
- Cible : phases datées, modifiables, chacun les siennes.

## 3. Stack technique

| Composant | Choix | Statut |
|---|---|---|
| Build | Vite 8 (8.3.6) | Vérifié. Exige Node ^20.19 ou >= 22.12 |
| Langage | TypeScript strict (6.0.3) | TS 7 exclu : hors peer range de typescript-eslint (`<6.1`) et svelte-check (`^5 \|\| ^6`) |
| UI | Svelte 5 (5.57.3, runes), sans SvelteKit, @sveltejs/vite-plugin-svelte 7.3.1 | Vérifié |
| Routage | Hash router maison (`#/jour`, `#/catalogue`...) | Évite les 404 de GitHub Pages sur un SPA |
| Stockage | Dexie 4.4.7 | Vérifié |
| PWA | vite-plugin-pwa 2.0.0 (Workbox 7.4), workbox-window 7.4.1 | Vérifié : peer `vite` inclut `^8.0.0` officiellement |
| Tests | Vitest 5.1.0 + fake-indexeddb 6.2.7 | Vérifié. Vitest 5 exige Node ^22.12 ou >= 24 |
| CI/CD | GitHub Actions (Node 24) : typecheck, lint, tests, build, déploiement Pages | |

Règles :
- Vérifier sur npm la dernière version stable de chaque dépendance à l'init. Aucun `--legacy-peer-deps`, aucun override de peer range.
- Lockfile versionné.
- Node >= 22.12 en local (champ `engines`), Node 24 LTS en CI.
- Pas de framework CSS imposé. CSS natif avec variables, mobile first.

## 4. Architecture

```
src/
  domain/        types, calculs, validation, fusion d'import. Pur TS, aucune dépendance navigateur.
  data/          Dexie (schéma, migrations), repositories, export/import.
  ciqual/        chargement et recherche dans le JSON Ciqual prétraité.
  ui/            composants et écrans Svelte.
  platform/      détection standalone iOS, storage.persist, wake lock, partage de fichiers.
scripts/
  build-ciqual.ts  prétraitement Ciqual (voir 7).
```

Règles :
- L'UI n'appelle jamais Dexie directement. Tout passe par des interfaces de repository dans `data/`. Objectif : pouvoir ajouter une synchronisation (Firebase ou autre) en v2 sans réécrire l'UI ni avoir deux stores locaux concurrents.
- `domain/` est testable sans navigateur. Toute la logique de calcul et de fusion y vit.
- Écritures Dexie dans des transactions. Toute erreur d'écriture produit un message clair à l'utilisateur, jamais un échec silencieux.

## 5. Concepts

- **Aliment** : valeurs nutritionnelles pour 100 g. Créé depuis Ciqual ou saisi manuellement.
- **Recette** : liste d'aliments avec quantités, telle que cuisinée habituellement. Seules les proportions comptent.
- **Version de recette** : état immuable d'une recette. Toute modification crée une nouvelle version.
- **Bloc** : quantité d'une version de recette qui fait 100 kcal.
- **Phase** : cible calorique datée (ex. "Sèche, 1 900 kcal, depuis le 01/11/2026").
- **Journée** : liste de (version de recette, nombre de blocs).
- **Modèle** : journée type réutilisable comme point de départ.

## 6. Modèle de données

Identifiants : `crypto.randomUUID()`. Dates : ISO 8601 UTC. Toute entité fusionnable porte `created_at`, `updated_at` et `deleted_at` (tombstone, sinon un élément supprimé réapparaît au prochain import).

```ts
type Food = {
  id: string;
  name: string;
  source: 'ciqual' | 'custom';
  ciqual_code?: string;
  ciqual_version?: string;          // ex. "2025"
  kcal_100g: number | null;         // null = manquant, saisie manuelle requise
  prot_100g: number | null;
  carb_100g: number | null;
  fat_100g: number | null;
  missing_flags: ('kcal' | 'prot' | 'carb' | 'fat')[]; // valeurs manquantes ou "traces" dans la source
  density_g_ml?: number;            // défaut 1, ~0,92 pour les huiles
  unit_weight_g?: number;
  is_unit_item: boolean;
  archived: boolean;
  created_at: string; updated_at: string; deleted_at?: string;
};

type Recipe = {
  id: string;
  name: string;
  category: 'petit-dejeuner' | 'plat' | 'gouter' | 'collation' | 'autre';
  archived: boolean;
  created_at: string; updated_at: string; deleted_at?: string;
};

type FoodSnapshot = Pick<Food,
  'name' | 'kcal_100g' | 'prot_100g' | 'carb_100g' | 'fat_100g' |
  'density_g_ml' | 'unit_weight_g' | 'is_unit_item'>;

type RecipeVersion = {             // immuable, jamais modifié ni supprimé
  id: string;
  recipe_id: string;
  created_at: string;
  lines: { food_id: string; food_snapshot: FoodSnapshot; quantity: number; unit: 'g' | 'ml' }[];
};

type Phase = {
  id: string; name: string; kcal_target: number; start_date: string; // YYYY-MM-DD
  created_at: string; updated_at: string; deleted_at?: string;
};

type Day = {
  id: string;
  date: string;                     // YYYY-MM-DD, unique par utilisateur (hors supprimées)
  status: 'draft' | 'validated';
  kcal_target_snapshot: number;
  entries: { recipe_version_id: string; blocks: number }[];
  created_at: string; updated_at: string; deleted_at?: string;
};

type Template = {
  id: string; name: string;
  entries: { recipe_id: string; blocks: number }[]; // version courante appliquée à l'usage
  created_at: string; updated_at: string; deleted_at?: string;
};

type Settings = {
  last_full_export_at?: string;
  persist_granted?: boolean;
  ciqual_version: string;
};
```

Écart avec la version précédente du cahier des charges :
- `version_no` n'est plus stocké. Il est dérivé à l'affichage (tri par `created_at`, puis `id`). Raison : deux appareils peuvent créer une version hors ligne en parallèle, un numéro stocké entrerait en collision à la fusion.
- Ajout de `deleted_at` (tombstones) et `missing_flags`.
- Les aliments Ciqual ne sont copiés dans la table `foods` qu'à leur première utilisation. Les valeurs restent alors figées, même si la table Ciqual embarquée change dans une version ultérieure de l'app.

Index Dexie minimaux : `foods: id, name, ciqual_code`, `recipes: id, name, category`, `recipeVersions: id, recipe_id, created_at`, `phases: id, start_date`, `days: id, date`, `templates: id`, `settings: key`.

Migrations : via `db.version(n).upgrade()`. Chaque migration a un test.

## 7. Ciqual

- Version : **Ciqual 2025** (publiée le 19/11/2025, 3 484 aliments, 74 constituants). DOI 10.57745/RDMHWY.
- Licence : Licence Ouverte Etalab 2.0, **confirmée** sur le dépôt Recherche Data Gouv (métadonnées du jeu de données, version 1 du 19/11/2025). Attribution obligatoire dans l'app (écran Réglages ou À propos) : "Anses. 2025. Table de composition nutritionnelle des aliments Ciqual".
- Source utilisée : fichiers **XML** du dépôt officiel. Pas l'Excel : le paquet `xlsx` sur npm est figé sur une version avec CVE connues.
- Prétraitement au build par `scripts/build-ciqual.ts`, jamais au runtime :
  - Sortie : `public/ciqual-2025.json`, compact : `[code, nom, nom_normalisé, kcal, prot, gluc, lip, flags]`.
  - Constituants (vérifiés dans `const_2025_11_03.xml`) : énergie `328` « Energie, Règlement UE N° 1169/2011 (kcal/100 g) » ; protéines `25003` « Protéines, N x 6.25 » (facteur du règlement 1169/2011, cohérent avec l'énergie 328, plutôt que `25000` N x facteur de Jones) ; glucides `31000` ; lipides `40000`.
  - `flags` : masque de bits (1 kcal, 2 prot, 4 gluc, 8 lip).
  - Valeurs non numériques ("traces", "< 0,5", "-", vide) : valeur `null` + flag. Décimales à virgule à convertir.
  - Encodage : UTF-8 avec BOM (vérifié), fins de ligne CRLF. 257 816 lignes de composition = 3 484 aliments × 74 constituants, sans trou.
  - Les XML sources ne sont pas versionnés (`compo` pèse 69 Mo). Le script les lit dans `data-src/ciqual-2025/` (ou `CIQUAL_DIR`) et les télécharge depuis le dépôt s'ils manquent. Le JSON produit (~420 Ko) est versionné.
- Recherche : en mémoire, sur nom normalisé (NFD, suppression des diacritiques, minuscules, ligatures œ/æ), correspondance par tokens : chaque mot saisi doit être le début d'un mot du nom (pas de sous-chaîne : « oeuf » ne doit pas remonter « bœuf »). Pas de librairie tant que la pertinence suffit.
- Le JSON Ciqual est précaché par le service worker.

## 8. Fonctionnalités

### 8.1 Aliments
- Recherche Ciqual hors ligne, tolérante aux accents.
- Aliments personnalisés : nom, kcal, protéines, glucides, lipides pour 100 g.
- Saisie manuelle des valeurs manquantes, avec signalement visuel tant qu'une valeur requise (kcal) est absente. Un aliment sans kcal ne peut pas être utilisé dans une recette.
- Densité optionnelle (défaut 1, pré-remplie ~0,92 pour les huiles).
- Poids unitaire optionnel pour les aliments "à l'unité".
- Modifier un aliment ne modifie aucune version existante. L'app liste les recettes concernées et propose de créer leurs nouvelles versions.

### 8.2 Recettes
- Champs : nom, catégorie, lignes (aliment, quantité, g ou ml).
- Affichage : kcal et macros totales, nombre de blocs de la recette entière, grammes par bloc par ingrédient.
- Toute modification crée une nouvelle version immuable. La plus récente est la courante.
- Historique consultable. Restaurer = créer une nouvelle version identique à l'ancienne.
- Archivage au lieu de suppression.
- Huile de cuisson : soit ingrédient d'une recette, soit recette à un seul ingrédient ("Huile d'olive", ~11 g par bloc) ajoutée à la journée par demi-bloc.

### 8.3 Phases
- Créer : nom, cible (multiple de 50), date de début.
- Phase active à une date = la plus récente dont `start_date <= date`.
- Historique conservé.
- Aucune phase définie : l'écran Jour demande d'en créer une.

### 8.4 Composition du jour (écran principal, mobile)
- Démarrer depuis : vide, la veille ou un modèle.
- Recettes groupées par catégorie, boutons +/- par demi-bloc. Recherche par nom.
- Compteur : cible, total, reste, en blocs et en kcal. Vert quand le reste vaut 0.
- Écart d'arrondi des ingrédients à l'unité, affiché en kcal.
- Macros du jour à titre informatif.
- Enregistrement automatique, statut brouillon ou validé. Une journée validée est en lecture seule ; « Rouvrir » la repasse explicitement en brouillon.
- Sauvegarder la journée comme modèle.
- `kcal_target_snapshot` pris à la création de la journée, recalculé tant qu'elle est en brouillon si la phase change.

### 8.5 Feuille du jour (en cuisine)
- Par recette : chaque ingrédient en g (ou ml si saisi en ml) pour N blocs, arrondi à l'unité.
- Ingrédients à l'unité : nombre arrondi, avec écart en kcal.
- Liste agrégée par aliment pour la journée.
- Lisible à distance. Écran maintenu allumé via Wake Lock API si disponible (support en mode écran d'accueil iOS à vérifier), sans erreur sinon.

### 8.6 Historique
- Journées passées en lecture seule. Chaque journée affiche les versions utilisées ce jour-là.

### 8.7 Export, import, sauvegarde
- **Export catalogue** : aliments, recettes, versions (tombstones inclus). Aucune donnée personnelle.
- **Export complet** : catalogue + phases, journées, modèles, réglages.
- Format : `{ schema_version, export_type: 'catalog' | 'full', exported_at, app_version, data: {...} }`.
- Export via `navigator.share` avec fichier si disponible (iOS), sinon téléchargement.
- Import : validation du schéma, migration si `schema_version` antérieur, refus explicite si postérieur. Aperçu avant application (X ajoutés, Y nouvelles versions, Z conflits résolus). Application dans une seule transaction.
- Règles de fusion :
  - Versions de recettes : union par `id`, jamais d'écrasement.
  - Version courante : la plus récente par `created_at`.
  - Toutes les autres entités : par `id`, le plus grand `updated_at` gagne, tombstones compris.
  - Un export catalogue ne touche jamais aux phases, journées, modèles ni réglages.
  - Les réglages ne sont jamais importés, même depuis un export complet : ils décrivent l'appareil (stockage persistant, date du dernier export).
  - Une seule journée non supprimée par date : si la fusion en produit deux à la même date, la plus récente (`updated_at`, puis `id`) est gardée, l'autre reçoit un tombstone. Compté dans les conflits résolus.
  - À `updated_at` égal et contenu différent, la sérialisation canonique la plus grande l'emporte, pour que le résultat soit identique quel que soit le sens de l'import.
- Limite connue : le last-write-wins dépend des horloges des appareils. Acceptable à deux utilisateurs.
- Rappel si le dernier export complet date de plus de 7 jours.
- Base vide au démarrage : proposer immédiatement la restauration.

### 8.8 Installation et fiabilité iOS
- Ouverte dans Safari sans être installée (`navigator.standalone !== true` sur iOS) : écran bloquant avec instructions d'installation. Le stockage Safari n'est pas partagé avec l'app installée. Sur ordinateur, pas de blocage.
- `navigator.storage.persist()` au premier lancement, état affiché dans Réglages.
- Fonctionnement entièrement hors ligne après la première ouverture.
- Mise à jour du service worker : prompt "Nouvelle version disponible", pas de rechargement automatique pendant une saisie.

## 9. Règles de calcul

```
grams(line)          = quantity                    si unit = g
                     = quantity * density_g_ml     si unit = ml (densité par défaut 1)
kcal(line)           = grams(line) * kcal_100g / 100
kcal_total(version)  = Σ kcal(line)
grams_for(line, N)   = grams(line) * N * 100 / kcal_total(version)
display_for(line, N) = grams_for(line, N) / density_g_ml   si unit = ml, sinon grams_for
units_for(line, N)   = round(grams_for(line, N) / unit_weight_g)   si is_unit_item
rounding_delta_kcal  = (units_for * unit_weight_g - grams_for) * kcal_100g / 100
```

- Calcul en flottants, arrondi uniquement à l'affichage.
- Contraintes : `blocks` multiple de 0,5 et > 0, `kcal_target` multiple de 50, `kcal_total > 0`, quantités > 0.
- Arrondi d'affichage : g et ml à l'unité. Si un ingrédient affiche 0 g pour N blocs, le signaler.
- Macros : même logique que kcal.

## 10. À vérifier en début d'implémentation

1. ~~Versions npm courantes~~ : fait le 08/11/2026, voir section 3.
2. ~~vite-plugin-pwa et Vite 8~~ : la 2.0.0 déclare `vite ^8.0.0` dans ses peers, installation sans conflit ni override.
3. ~~Ciqual 2025~~ : licence, structure, encodage et constituants vérifiés, voir section 7.
4. iOS (sur l'iPhone, déployé sur GitHub Pages) :
   - détection standalone et écran bloquant ;
   - résultat de `navigator.storage.persist()` en mode écran d'accueil ;
   - effet de "Effacer historique et données" de Safari sur l'app installée ;
   - export via `navigator.share` avec fichier JSON vers Fichiers et Google Drive ;
   - import via `<input type="file">` depuis Fichiers et Google Drive ;
   - Wake Lock API en mode écran d'accueil.

## 11. Ordre d'implémentation

1. **Init** : projet, dépendances vérifiées, TS strict, lint, Vitest, CI GitHub Actions avec déploiement Pages.
2. **Spike iOS** : coquille PWA minimale déployée, valider tous les points 10.4 sur l'iPhone avant le reste. Risque principal du projet.
3. **Domaine** : types, calculs, validation. Tests unitaires exhaustifs (arrondis, ml, unités, cas limites).
4. **Données** : schéma Dexie, repositories, export/import/fusion. Tests avec fake-indexeddb (fusion, tombstones, versions concurrentes, migrations de schéma d'export).
5. **Ciqual** : script de prétraitement, tests sur un échantillon du XML, recherche.
6. **UI** : Jour, Feuille du jour, Catalogue, Aliments, Phases, Historique, Réglages.
7. **Finition** : rappels de sauvegarde, restauration au démarrage, prompt de mise à jour, attribution Ciqual.

## 12. Exigences non fonctionnelles

- Interface en français, responsive mobile à ordinateur.
- Aucune requête réseau hors chargement de l'app, aucun traçage, aucune police ou ressource tierce.
- Tests obligatoires : moteur de calcul, fusion à l'import, migrations.
- Accessibilité de base : cibles tactiles ≥ 44 px, contrastes suffisants, labels sur les champs.

## 13. Hors v1

- Synchronisation cloud (Firebase), préparée par la couche repository.
- Cuisson en lot (pesée du plat cuit).
- Coefficient d'huile absorbée.
- Planification multi-jours, liste de courses (perso ou commune).
- Garde-fous macros, suggestions pour combler le reste.
- Scan de code-barres (Open Food Facts), intégration directe Google Drive.
- Unités ménagères (cuillères, unités de fruit), arrondis cohérents, brouillons de recette : voir [SPEC-v1.1.md](SPEC-v1.1.md).

## 14. Questions ouvertes

- **Journée en brouillon et nouvelle version de recette** : une journée brouillon pointe sur la version présente au moment de l'ajout. Si la recette change dans la journée, faut-il basculer automatiquement vers la nouvelle version, ou proposer un bouton "mettre à jour" ? Défaut proposé : bouton, pas de bascule silencieuse. Une journée validée ne change jamais. **Implémenté avec le défaut** (bouton « mettre à jour » sur l'entrée), à confirmer à l'usage.
- **« Comme la veille » et modèles** : les entrées sont reprises avec la version courante de chaque recette, pas la version utilisée la veille. À confirmer.
