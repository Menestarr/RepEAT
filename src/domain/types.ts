export type MacroKey = 'kcal' | 'prot' | 'carb' | 'fat';
/**
 * Unités de saisie d'une ligne de recette (v1.1).
 * Conversions et libellés : voir units.ts. Les versions v1 n'utilisent que g et ml.
 */
export type Unit = 'g' | 'ml' | 'cac' | 'cas' | 'u' | 'pincee';

/** Pas d'arrondi d'un aliment saisi à l'unité : ½ fruit, 1 œuf. */
export type UnitStep = 0.5 | 1;

export type Category = 'petit-dejeuner' | 'plat' | 'gouter' | 'collation' | 'autre';

export const CATEGORIES: readonly { id: Category; label: string }[] = [
  { id: 'petit-dejeuner', label: 'Petit-déjeuner' },
  { id: 'plat', label: 'Plat' },
  { id: 'gouter', label: 'Goûter' },
  { id: 'collation', label: 'Collation' },
  { id: 'autre', label: 'Autre' },
];

export type Timestamps = {
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export type Food = {
  id: string;
  name: string;
  source: 'ciqual' | 'custom';
  ciqual_code?: string;
  ciqual_version?: string;
  kcal_100g: number | null;
  prot_100g: number | null;
  carb_100g: number | null;
  fat_100g: number | null;
  missing_flags: MacroKey[];
  density_g_ml?: number;
  /** Poids de la partie comestible d'une unité (Ciqual est exprimé pour 100 g comestibles). */
  unit_weight_g?: number;
  /** Libellé singulier de l'unité (« avocat », « œuf »). Défaut : « unité ». */
  unit_label?: string;
  /** Pas d'arrondi en unités. Défaut : 1. */
  unit_step?: UnitStep;
  /** Valeurs d'unité pré-remplies (unitDefaults.ts), pas encore modifiées par l'utilisateur. */
  unit_indicative?: boolean;
  /**
   * Dérivé depuis la v1.1 : vrai si unit_weight_g > 0 (voir hasUnitWeight).
   * Conservé pour la compatibilité des exports, synchronisé à l'écriture.
   */
  is_unit_item: boolean;
  archived: boolean;
} & Timestamps;

export type Recipe = {
  id: string;
  name: string;
  category: Category;
  archived: boolean;
} & Timestamps;

export type FoodSnapshot = Pick<
  Food,
  | 'name'
  | 'kcal_100g'
  | 'prot_100g'
  | 'carb_100g'
  | 'fat_100g'
  | 'density_g_ml'
  | 'unit_weight_g'
  | 'unit_label'
  | 'unit_step'
  | 'is_unit_item'
>;

export type RecipeLine = {
  food_id: string;
  food_snapshot: FoodSnapshot;
  quantity: number;
  unit: Unit;
};

/** Immuable : jamais modifié ni supprimé. */
export type RecipeVersion = {
  id: string;
  recipe_id: string;
  created_at: string;
  lines: RecipeLine[];
};

export type Phase = {
  id: string;
  name: string;
  kcal_target: number;
  start_date: string;
} & Timestamps;

export type DayEntry = { recipe_version_id: string; blocks: number };

export type Day = {
  id: string;
  date: string;
  status: 'draft' | 'validated';
  kcal_target_snapshot: number;
  entries: DayEntry[];
} & Timestamps;

export type TemplateEntry = { recipe_id: string; blocks: number };

export type Template = {
  id: string;
  name: string;
  entries: TemplateEntry[];
} & Timestamps;

export type Settings = {
  last_full_export_at?: string;
  persist_granted?: boolean;
  ciqual_version: string;
};

/** Instantané figé dans une ligne de recette : les versions restent immuables si l'aliment change. */
export function snapshotOf(food: Food): FoodSnapshot {
  const s: FoodSnapshot = {
    name: food.name,
    kcal_100g: food.kcal_100g,
    prot_100g: food.prot_100g,
    carb_100g: food.carb_100g,
    fat_100g: food.fat_100g,
    is_unit_item: food.is_unit_item,
  };
  if (food.density_g_ml !== undefined) s.density_g_ml = food.density_g_ml;
  if (food.unit_weight_g !== undefined) s.unit_weight_g = food.unit_weight_g;
  // Champs v1.1 ajoutés seulement s'ils sont définis : un aliment v1 garde le même
  // instantané (même JSON), donc aucune recette n'apparaît « à mettre à jour ».
  if (food.unit_label !== undefined) s.unit_label = food.unit_label;
  if (food.unit_step !== undefined) s.unit_step = food.unit_step;
  return s;
}

/** Ligne de brouillon : référence l'aliment par id, sans instantané (relu à la restauration). */
export type DraftLine = {
  food_id: string;
  /** Quantité brute, telle que saisie (« 1,5 », « », « 2. »). */
  quantity: string;
  unit: Unit;
};

/**
 * Brouillon de l'écran Recette (SPEC v1.1 §6). Local à l'appareil :
 * jamais exporté, importé ni fusionné.
 */
export type RecipeDraft = {
  /** = recipe_id pour une recette existante, uuid sinon. */
  id: string;
  /** Absent pour une nouvelle recette. */
  recipe_id?: string;
  /** Version courante à l'ouverture du brouillon (détection d'un import entre-temps). */
  base_version_id?: string;
  name: string;
  category: Category;
  lines: DraftLine[];
  /** Sert à numéroter les brouillons « Sans nom (n) » de façon stable. */
  created_at: string;
  updated_at: string;
};
