/**
 * Unités de mesure (SPEC v1.1 §4) : définition, conversion en grammes,
 * unités proposées pour un aliment.
 *
 * Toute la connaissance « unité » est ici. Ajouter une unité = l'ajouter au type
 * `Unit` (types.ts) et à UNIT_DEFS ; le compilateur signale les autres endroits.
 */
import type { Food, FoodSnapshot, Unit, UnitStep } from './types';

/** Volume d'une cuillère à café, en ml. */
export const TSP_ML = 5;
/** Une cuillère à soupe = 3 cuillères à café (15 ml). */
export const TSP_PER_TBSP = 3;
/** Poids conventionnel d'une pincée (kcal négligeables). */
export const PINCH_G = 0.5;

export const DEFAULT_UNIT_LABEL = 'unité';
export const DEFAULT_UNIT_STEP: UnitStep = 1;

type UnitDef = {
  /** Libellé du sélecteur d'unité. */
  label: string;
  /**
   * Famille de l'unité. Les quantités d'une même famille s'additionnent entre elles
   * (liste agrégée), et l'arrondi est commun à la famille (rounding.ts).
   */
  family: 'weight' | 'volume' | 'spoon' | 'unit' | 'pinch';
};

export const UNIT_DEFS: Readonly<Record<Unit, UnitDef>> = {
  g: { label: 'g', family: 'weight' },
  ml: { label: 'ml', family: 'volume' },
  cac: { label: 'c. à café', family: 'spoon' },
  cas: { label: 'c. à soupe', family: 'spoon' },
  u: { label: 'unité', family: 'unit' },
  pincee: { label: 'pincée', family: 'pinch' },
};

/** Liste des codes valides (validation des imports, sélecteurs). */
export const UNITS = Object.keys(UNIT_DEFS) as Unit[];

export function isUnit(x: unknown): x is Unit {
  return typeof x === 'string' && x in UNIT_DEFS;
}

/** Densité utilisée pour ml et cuillères (1 si absente ou invalide). */
export function densityOf(s: Pick<FoodSnapshot, 'density_g_ml'>): number {
  return s.density_g_ml !== undefined && s.density_g_ml > 0 ? s.density_g_ml : 1;
}

/**
 * Poids d'une unité, ou null si l'aliment n'en a pas.
 * Remplace `is_unit_item`, désormais dérivé de ce poids.
 */
export function unitWeightOf(s: Pick<FoodSnapshot, 'unit_weight_g'>): number | null {
  return s.unit_weight_g !== undefined && s.unit_weight_g > 0 ? s.unit_weight_g : null;
}

export function hasUnitWeight(s: Pick<FoodSnapshot, 'unit_weight_g'>): boolean {
  return unitWeightOf(s) !== null;
}

export function unitLabelOf(s: Pick<FoodSnapshot, 'unit_label'>): string {
  return s.unit_label?.trim() || DEFAULT_UNIT_LABEL;
}

export function unitStepOf(s: Pick<FoodSnapshot, 'unit_step'>): UnitStep {
  return s.unit_step ?? DEFAULT_UNIT_STEP;
}

/** Une quantité dans une unité donnée. */
export type Amount = { unit: Unit; value: number };

/**
 * Conversion en grammes. Pour `u` sans poids unitaire (interdit par la validation),
 * renvoie NaN plutôt qu'une valeur fausse.
 */
export function toGrams(a: Amount, s: FoodSnapshot): number {
  switch (a.unit) {
    case 'g':
      return a.value;
    case 'ml':
      return a.value * densityOf(s);
    case 'cac':
      return a.value * TSP_ML * densityOf(s);
    case 'cas':
      return a.value * TSP_PER_TBSP * TSP_ML * densityOf(s);
    case 'u': {
      const uw = unitWeightOf(s);
      return uw === null ? NaN : a.value * uw;
    }
    case 'pincee':
      return a.value * PINCH_G;
  }
}

/** Quantité de cuillères exprimée en c. à café (unité commune de l'arrondi des cuillères). */
export function toTeaspoons(a: Amount): number {
  return a.unit === 'cas' ? a.value * TSP_PER_TBSP : a.value;
}

/** Poids d'une c. à soupe de cet aliment (affiché à côté de la densité). */
export function tablespoonGrams(s: Pick<FoodSnapshot, 'density_g_ml'>): number {
  return TSP_PER_TBSP * TSP_ML * densityOf(s);
}

/**
 * Unités proposées dans le sélecteur d'une ligne, dans l'ordre d'affichage :
 * `u` seulement si l'aliment a un poids unitaire, `pincee` toujours en dernier.
 */
export function availableUnits(s: Pick<FoodSnapshot, 'unit_weight_g'>): Unit[] {
  const out: Unit[] = [];
  if (hasUnitWeight(s)) out.push('u');
  out.push('g', 'ml', 'cac', 'cas', 'pincee');
  return out;
}

/** « Huile », « huiles » comme mot (pas « huilé »). Sert à la densité et à l'unité par défaut. */
export function isOilName(name: string): boolean {
  return /(^|[^a-zà-ÿ])huiles?([^a-zà-ÿ]|$)/i.test(name);
}

/** Unité par défaut à l'ajout d'un aliment dans une recette (§4.5). */
export function defaultUnit(f: Pick<Food, 'name' | 'unit_weight_g'>): Unit {
  if (hasUnitWeight(f)) return 'u';
  if (isOilName(f.name)) return 'cas';
  return 'g';
}

/** Libellé de l'option du sélecteur : pour `u`, le libellé de l'aliment (« avocat »). */
export function unitOptionLabel(unit: Unit, s: Pick<FoodSnapshot, 'unit_label'>): string {
  return unit === 'u' ? unitLabelOf(s) : UNIT_DEFS[unit].label;
}
