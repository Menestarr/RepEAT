export type MacroKey = 'kcal' | 'prot' | 'carb' | 'fat';
export type Unit = 'g' | 'ml';

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
  unit_weight_g?: number;
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
  'name' | 'kcal_100g' | 'prot_100g' | 'carb_100g' | 'fat_100g' | 'density_g_ml' | 'unit_weight_g' | 'is_unit_item'
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
  return s;
}
