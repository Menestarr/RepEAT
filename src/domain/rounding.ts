/**
 * Arrondis d'affichage (SPEC v1.1 §5.2).
 *
 * Les calculs restent en flottants ; on n'arrondit qu'une quantité à afficher
 * (ce qu'on pèse ou mesure). Chaque famille d'unités a son pas :
 * - g, ml : 1 sous 100, 5 à partir de 100 ;
 * - cuillères : ½ c. à café, quelle que soit l'unité de saisie (cac ou cas) ;
 * - u : pas de l'aliment (½ fruit, 1 œuf) ;
 * - pincée : 1.
 * Une quantité non nulle n'est jamais arrondie à 0 : plancher à un pas.
 */
import type { FoodSnapshot } from './types';
import { toTeaspoons, unitStepOf, UNIT_DEFS, type Amount } from './units';

/** Seuil (en g ou ml) à partir duquel le pas passe de 1 à 5. */
export const COARSE_THRESHOLD = 100;
export const COARSE_STEP = 5;
/** Pas des cuillères, en c. à café. */
export const SPOON_STEP_TSP = 0.5;
/** Un arrondi qui dépasse la quantité exacte de plus de 50 % est signalé « arrondi fort ». */
export const STRONG_ROUNDING_RATIO = 1.5;

/** Tolérance pour neutraliser les erreurs de flottant (2,4999999 → 2,5). */
const EPS = 1e-9;

/** Arrondi au plus proche, demi vers le haut (valeurs positives). */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5 + EPS);
}

/**
 * Normalise une quantité de cuillères en c. à café : l'arrondi et l'affichage
 * des cuillères se font toujours dans cette unité (§5.2, « Cuillères »).
 */
export function normalizeSpoons(a: Amount): Amount {
  return UNIT_DEFS[a.unit].family === 'spoon' ? { unit: 'cac', value: toTeaspoons(a) } : a;
}

/** Pas d'arrondi pour une quantité exacte (déjà normalisée). */
export function stepFor(a: Amount, s: Pick<FoodSnapshot, 'unit_step'>): number {
  switch (UNIT_DEFS[a.unit].family) {
    case 'weight':
    case 'volume':
      return a.value < COARSE_THRESHOLD ? 1 : COARSE_STEP;
    case 'spoon':
      return SPOON_STEP_TSP;
    case 'unit':
      return unitStepOf(s);
    case 'pinch':
      return 1;
  }
}

/**
 * Quantité arrondie au pas, avec plancher à un pas si la quantité est non nulle.
 * Les cuillères sont renvoyées en c. à café (unit = 'cac').
 */
export function roundAmount(exact: Amount, s: Pick<FoodSnapshot, 'unit_step'>): Amount {
  const a = normalizeSpoons(exact);
  if (!(a.value > 0)) return { unit: a.unit, value: 0 };
  const step = stepFor(a, s);
  return { unit: a.unit, value: Math.max(step, roundHalfUp(a.value / step) * step) };
}

/** Vrai si l'arrondi gonfle la quantité de plus de 50 % (ex. 0,2 avocat → ½). */
export function isStrongRounding(exact: number, rounded: number): boolean {
  return exact > 0 && rounded > exact * STRONG_ROUNDING_RATIO + EPS;
}
