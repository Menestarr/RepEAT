/**
 * Calculs nutritionnels d'une recette et d'une journée.
 * Tout est en flottants ; l'arrondi d'affichage est délégué à rounding.ts.
 */
import { isStrongRounding, normalizeSpoons, roundAmount } from './rounding';
import type { FoodSnapshot, RecipeLine, RecipeVersion, Unit } from './types';
import { toGrams, type Amount } from './units';

export { densityOf } from './units';

export const BLOCK_KCAL = 100;

export type Macros = { kcal: number; prot: number; carb: number; fat: number };

export const ZERO_MACROS: Readonly<Macros> = Object.freeze({ kcal: 0, prot: 0, carb: 0, fat: 0 });

export class CalcError extends Error {}

type Lines = Pick<RecipeVersion, 'lines'>;

/** grams(line) : quantité saisie convertie en grammes (toutes unités, voir units.toGrams). */
export function lineGrams(line: RecipeLine): number {
  return toGrams({ unit: line.unit, value: line.quantity }, line.food_snapshot);
}

export function macrosForGrams(s: FoodSnapshot, grams: number): Macros {
  return {
    kcal: (grams * (s.kcal_100g ?? 0)) / 100,
    prot: (grams * (s.prot_100g ?? 0)) / 100,
    carb: (grams * (s.carb_100g ?? 0)) / 100,
    fat: (grams * (s.fat_100g ?? 0)) / 100,
  };
}

export function lineMacros(line: RecipeLine): Macros {
  return macrosForGrams(line.food_snapshot, lineGrams(line));
}

export function addMacros(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, prot: a.prot + b.prot, carb: a.carb + b.carb, fat: a.fat + b.fat };
}

export function scaleMacros(a: Macros, k: number): Macros {
  return { kcal: a.kcal * k, prot: a.prot * k, carb: a.carb * k, fat: a.fat * k };
}

export function versionTotals(v: Lines): Macros {
  return v.lines.reduce((acc, l) => addMacros(acc, lineMacros(l)), { ...ZERO_MACROS });
}

/** Nombre de blocs de la recette entière. */
export function versionBlocks(v: Lines): number {
  return versionTotals(v).kcal / BLOCK_KCAL;
}

/** Facteur à appliquer aux quantités de la recette pour obtenir N blocs. */
export function scaleFactor(v: Lines, blocks: number): number {
  const total = versionTotals(v).kcal;
  if (!(total > 0)) throw new CalcError('La recette doit avoir un total de kcal strictement positif.');
  return (blocks * BLOCK_KCAL) / total;
}

/** grams_for(line, N) */
export function gramsFor(v: Lines, line: RecipeLine, blocks: number): number {
  return lineGrams(line) * scaleFactor(v, blocks);
}

/**
 * Quantité exacte (non arrondie) pour N blocs, dans l'unité de saisie de la ligne.
 * Les cuillères sont normalisées en c. à café (voir rounding.normalizeSpoons).
 */
export function exactAmountFor(v: Lines, line: RecipeLine, blocks: number): Amount {
  return normalizeSpoons({ unit: line.unit, value: line.quantity * scaleFactor(v, blocks) });
}

/** Une ligne du tableau des portions : quantité exacte, quantité à peser et écart en kcal. */
export type PortionLine = {
  food_id: string;
  name: string;
  /** Instantané de l'aliment (libellé d'unité, poids unitaire) pour l'affichage. */
  snapshot: FoodSnapshot;
  /** Quantité exacte pour N blocs, en unité de saisie (cuillères en c. à café). */
  exact: Amount;
  /** Quantité affichée, arrondie au pas de l'unité (jamais 0). */
  rounded: Amount;
  /** Grammes exacts (grams_for). */
  grams: number;
  /** Grammes correspondant à la quantité arrondie. */
  rounded_grams: number;
  /** rounding_delta_kcal : positif = on mange plus que prévu. */
  delta_kcal: number;
  /** « Arrondi fort » : la quantité arrondie dépasse l'exacte de plus de 50 %. */
  strong: boolean;
};

export type Portion = {
  lines: PortionLine[];
  /** Macros exactes (blocs × 100 kcal), indépendantes des arrondis. */
  macros: Macros;
  /** Somme des écarts d'arrondi des lignes. */
  delta_kcal: number;
};

function portionLine(v: Lines, line: RecipeLine, blocks: number): PortionLine {
  const s = line.food_snapshot;
  const exact = exactAmountFor(v, line, blocks);
  const rounded = roundAmount(exact, s);
  const grams = gramsFor(v, line, blocks);
  const roundedGrams = toGrams(rounded, s);
  return {
    food_id: line.food_id,
    name: s.name,
    snapshot: s,
    exact,
    rounded,
    grams,
    rounded_grams: roundedGrams,
    delta_kcal: ((roundedGrams - grams) * (s.kcal_100g ?? 0)) / 100,
    strong: isStrongRounding(exact.value, rounded.value),
  };
}

export function portion(v: Lines, blocks: number): Portion {
  const lines = v.lines.map((line) => portionLine(v, line, blocks));
  return {
    lines,
    macros: scaleMacros(versionTotals(v), scaleFactor(v, blocks)),
    delta_kcal: lines.reduce((s, l) => s + l.delta_kcal, 0),
  };
}

/** Quantités pour 1 bloc. */
export function perBlock(v: Lines): PortionLine[] {
  return portion(v, 1).lines;
}

/**
 * Total d'un aliment sur la journée (SPEC v1.1 §5.4) : somme des quantités
 * arrondies de chaque recette, par famille d'unités, sans conversion entre familles.
 */
export type AggregatedLine = {
  food_id: string;
  name: string;
  snapshot: FoodSnapshot;
  /** Un total par famille d'unités, dans l'ordre de AGGREGATE_ORDER (« 1 avocat + 60 g »). */
  parts: Amount[];
  rounded_grams: number;
  delta_kcal: number;
};

/** Ordre d'affichage des parts d'une ligne agrégée. Les cuillères sont en c. à café. */
const AGGREGATE_ORDER: readonly Unit[] = ['u', 'cac', 'g', 'ml', 'pincee'];

export function aggregate(items: { version: Lines; blocks: number }[]): AggregatedLine[] {
  type Acc = Omit<AggregatedLine, 'parts'> & { totals: Map<Unit, number> };
  const map = new Map<string, Acc>();
  for (const { version, blocks } of items) {
    for (const pl of portion(version, blocks).lines) {
      let acc = map.get(pl.food_id);
      if (!acc) {
        acc = { food_id: pl.food_id, name: pl.name, snapshot: pl.snapshot, totals: new Map(), rounded_grams: 0, delta_kcal: 0 };
        map.set(pl.food_id, acc);
      }
      // rounded est déjà normalisé (cuillères en cac) : une clé par famille.
      acc.totals.set(pl.rounded.unit, (acc.totals.get(pl.rounded.unit) ?? 0) + pl.rounded.value);
      acc.rounded_grams += pl.rounded_grams;
      acc.delta_kcal += pl.delta_kcal;
    }
  }
  return [...map.values()]
    .map(({ totals, ...a }): AggregatedLine => ({
      ...a,
      parts: AGGREGATE_ORDER.filter((u) => totals.has(u)).map((u) => ({ unit: u, value: totals.get(u)! })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export type DaySummary = {
  target_kcal: number;
  total_kcal: number;
  remaining_kcal: number;
  target_blocks: number;
  total_blocks: number;
  remaining_blocks: number;
  macros: Macros;
  /** Écart total d'arrondi, informatif : le reste en blocs n'en tient pas compte. */
  delta_kcal: number;
  done: boolean;
};

export function daySummary(items: { version: Lines; blocks: number }[], targetKcal: number): DaySummary {
  let macros: Macros = { ...ZERO_MACROS };
  let delta = 0;
  let blocks = 0;
  for (const { version, blocks: n } of items) {
    const p = portion(version, n);
    macros = addMacros(macros, p.macros);
    delta += p.delta_kcal;
    blocks += n;
  }
  const total = blocks * BLOCK_KCAL;
  const remaining = targetKcal - total;
  return {
    target_kcal: targetKcal,
    total_kcal: total,
    remaining_kcal: remaining,
    target_blocks: targetKcal / BLOCK_KCAL,
    total_blocks: blocks,
    remaining_blocks: remaining / BLOCK_KCAL,
    macros,
    delta_kcal: delta,
    done: Math.abs(remaining) < 1e-9,
  };
}
