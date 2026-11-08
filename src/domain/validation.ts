import { versionTotals } from './calc';
import type { Food, RecipeLine } from './types';

const EPS = 1e-9;

export function isMultipleOf(n: number, step: number): boolean {
  if (!Number.isFinite(n)) return false;
  const q = n / step;
  return Math.abs(q - Math.round(q)) < EPS;
}

export function validateBlocks(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return 'Le nombre de blocs doit être strictement positif.';
  if (!isMultipleOf(n, 0.5)) return 'Le nombre de blocs doit être un multiple de 0,5.';
  return null;
}

export function validateKcalTarget(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return 'La cible doit être strictement positive.';
  if (!isMultipleOf(n, 50)) return 'La cible doit être un multiple de 50 kcal.';
  return null;
}

export function validateQuantity(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return 'La quantité doit être strictement positive.';
  return null;
}

export function foodUsableInRecipe(food: Pick<Food, 'kcal_100g' | 'name'>): string | null {
  if (food.kcal_100g === null || !Number.isFinite(food.kcal_100g)) {
    return `« ${food.name} » n'a pas de valeur kcal : complétez-la avant de l'utiliser.`;
  }
  return null;
}

export function validateLines(lines: RecipeLine[]): string[] {
  const errors: string[] = [];
  if (lines.length === 0) errors.push('La recette doit contenir au moins un ingrédient.');
  for (const l of lines) {
    const q = validateQuantity(l.quantity);
    if (q) errors.push(`${l.food_snapshot.name} : ${q}`);
    const f = foodUsableInRecipe(l.food_snapshot);
    if (f) errors.push(f);
  }
  if (errors.length === 0 && !(versionTotals({ lines }).kcal > 0)) {
    errors.push('Le total de kcal de la recette doit être strictement positif.');
  }
  return errors;
}

export type FoodDraft = {
  name: string;
  kcal_100g: number | null;
  prot_100g: number | null;
  carb_100g: number | null;
  fat_100g: number | null;
  density_g_ml?: number;
  unit_weight_g?: number;
  is_unit_item: boolean;
};

function nonNegativeOrNull(v: number | null, label: string, errors: string[]) {
  if (v !== null && (!Number.isFinite(v) || v < 0)) errors.push(`${label} : valeur positive ou vide.`);
}

export function validateFood(d: FoodDraft): string[] {
  const errors: string[] = [];
  if (!d.name.trim()) errors.push('Le nom est requis.');
  nonNegativeOrNull(d.kcal_100g, 'kcal', errors);
  nonNegativeOrNull(d.prot_100g, 'Protéines', errors);
  nonNegativeOrNull(d.carb_100g, 'Glucides', errors);
  nonNegativeOrNull(d.fat_100g, 'Lipides', errors);
  if (d.kcal_100g !== null && d.kcal_100g > 900) errors.push('kcal : 900 kcal pour 100 g au maximum.');
  if (d.density_g_ml !== undefined && !(d.density_g_ml > 0)) errors.push('La densité doit être strictement positive.');
  if (d.is_unit_item && !(d.unit_weight_g !== undefined && d.unit_weight_g > 0)) {
    errors.push("Un aliment à l'unité doit avoir un poids unitaire.");
  }
  return errors;
}

/** Densité pré-remplie (~0,92 pour les huiles). */
export function defaultDensity(name: string): number | undefined {
  return /(^|[^a-z])huiles?([^a-z]|$)/i.test(name) ? 0.92 : undefined;
}
