/**
 * Affichage des quantités arrondies (SPEC v1.1 §5.2) :
 * « 37 g », « ½ avocat », « 1 ½ c. à soupe », « 1 c. à soupe + ½ c. à café », « 2 pincées ».
 *
 * Les valeurs reçues sont supposées déjà arrondies (rounding.ts) ;
 * ce module ne fait que les mettre en mots.
 */
import { fmtInt } from './format';
import type { FoodSnapshot } from './types';
import { TSP_PER_TBSP, unitLabelOf, unitWeightOf, type Amount } from './units';

const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const EPS = 1e-9;

/** « ½ », « 1 ½ », « 2 » pour un multiple de 0,5 ; sinon une décimale (« 0,3 »). */
export function fmtHalves(n: number): string {
  const whole = Math.floor(n + EPS);
  const frac = n - whole;
  if (Math.abs(frac) < EPS) return fmtInt(whole);
  if (Math.abs(frac - 0.5) < EPS) return whole === 0 ? '½' : `${fmtInt(whole)} ½`;
  return nf1.format(n);
}

/**
 * Pluriel français simple : ajoute « s » sauf après s, x, z.
 * Pluriel à partir de 2, comme en français (« 1 ½ avocat », « 2 avocats »).
 */
export function pluralize(label: string, n: number): string {
  if (n < 2 - EPS || /[sxz]$/i.test(label)) return label;
  return label + 's';
}

/** Décompose des c. à café en c. à soupe (partie entière de tsp / 3) + reste en c. à café. */
export function splitSpoons(tsp: number): { tbsp: number; tsp: number } {
  const tbsp = Math.floor(tsp / TSP_PER_TBSP + EPS);
  const rest = tsp - tbsp * TSP_PER_TBSP;
  return { tbsp, tsp: Math.abs(rest) < EPS ? 0 : rest };
}

/** « 2 ½ c. à café », « 1 c. à soupe + ½ c. à café », « 2 c. à soupe ». */
export function formatSpoons(tsp: number): string {
  const { tbsp, tsp: rest } = splitSpoons(tsp);
  const parts: string[] = [];
  if (tbsp > 0) parts.push(`${fmtHalves(tbsp)} c. à soupe`);
  if (rest > 0 || tbsp === 0) parts.push(`${fmtHalves(rest)} c. à café`);
  return parts.join(' + ');
}

/**
 * Quantité lisible dans son unité. Les cuillères (cac ou cas) sont attendues
 * en c. à café et décomposées ; voir rounding.normalizeSpoons.
 */
export function formatAmount(a: Amount, s: Pick<FoodSnapshot, 'unit_label'>): string {
  switch (a.unit) {
    case 'g':
    case 'ml':
      return `${fmtInt(a.value)} ${a.unit}`;
    case 'cac':
      return formatSpoons(a.value);
    case 'cas':
      return formatSpoons(a.value * TSP_PER_TBSP);
    case 'u':
      return `${fmtHalves(a.value)} ${pluralize(unitLabelOf(s), a.value)}`;
    case 'pincee':
      return `${fmtHalves(a.value)} ${pluralize('pincée', a.value)}`;
  }
}

/** Rappel du poids unitaire pour un aliment à l'unité affiché en g : « 1 avocat = 140 g ». */
export function unitWeightHint(s: Pick<FoodSnapshot, 'unit_weight_g' | 'unit_label'>): string | null {
  const uw = unitWeightOf(s);
  return uw === null ? null : `1 ${unitLabelOf(s)} = ${fmtInt(uw)} g`;
}

/** Totaux de plusieurs unités : « 2 c. à soupe + 20 g ». */
export function formatParts(parts: Amount[], s: Pick<FoodSnapshot, 'unit_label'>): string {
  return parts.map((p) => formatAmount(p, s)).join(' + ');
}

/**
 * Rappel du poids unitaire à afficher à côté de ces quantités : seulement si l'une
 * d'elles est en g ou ml (en unités, le rappel serait redondant).
 */
export function hintFor(parts: Amount[], s: Pick<FoodSnapshot, 'unit_weight_g' | 'unit_label'>): string | null {
  return parts.some((p) => p.unit === 'g' || p.unit === 'ml') ? unitWeightHint(s) : null;
}
