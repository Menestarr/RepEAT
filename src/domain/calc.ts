import type { FoodSnapshot, RecipeLine, RecipeVersion, Unit } from './types';

export const BLOCK_KCAL = 100;

export type Macros = { kcal: number; prot: number; carb: number; fat: number };

export const ZERO_MACROS: Readonly<Macros> = Object.freeze({ kcal: 0, prot: 0, carb: 0, fat: 0 });

export class CalcError extends Error {}

type Lines = Pick<RecipeVersion, 'lines'>;

export function densityOf(s: FoodSnapshot): number {
  return s.density_g_ml !== undefined && s.density_g_ml > 0 ? s.density_g_ml : 1;
}

/** grams(line) : quantité saisie convertie en grammes. */
export function lineGrams(line: RecipeLine): number {
  return line.unit === 'ml' ? line.quantity * densityOf(line.food_snapshot) : line.quantity;
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

/** display_for(line, N) : valeur à afficher dans l'unité de saisie. */
export function displayFor(v: Lines, line: RecipeLine, blocks: number): { amount: number; unit: Unit } {
  const g = gramsFor(v, line, blocks);
  return line.unit === 'ml' ? { amount: g / densityOf(line.food_snapshot), unit: 'ml' } : { amount: g, unit: 'g' };
}

function unitWeight(s: FoodSnapshot): number | null {
  return s.is_unit_item && s.unit_weight_g !== undefined && s.unit_weight_g > 0 ? s.unit_weight_g : null;
}

/** units_for(line, N) : nombre d'unités arrondi, null si l'aliment n'est pas à l'unité. */
export function unitsFor(v: Lines, line: RecipeLine, blocks: number): number | null {
  const uw = unitWeight(line.food_snapshot);
  if (uw === null) return null;
  return Math.round(gramsFor(v, line, blocks) / uw);
}

/** rounding_delta_kcal : écart dû à l'arrondi des unités (positif = plus de kcal que prévu). */
export function roundingDeltaKcal(v: Lines, line: RecipeLine, blocks: number): number {
  const uw = unitWeight(line.food_snapshot);
  if (uw === null) return 0;
  const grams = gramsFor(v, line, blocks);
  const units = Math.round(grams / uw);
  return ((units * uw - grams) * (line.food_snapshot.kcal_100g ?? 0)) / 100;
}

export type PortionLine = {
  food_id: string;
  name: string;
  grams: number;
  amount: number;
  unit: Unit;
  rounded: number;
  units: number | null;
  delta_kcal: number;
  /** L'ingrédient s'affiche à 0 (g, ml ou unités) pour ce nombre de blocs. */
  zero: boolean;
};

export type Portion = {
  lines: PortionLine[];
  macros: Macros;
  delta_kcal: number;
};

export function portion(v: Lines, blocks: number): Portion {
  const lines = v.lines.map((line): PortionLine => {
    const grams = gramsFor(v, line, blocks);
    const { amount, unit } = displayFor(v, line, blocks);
    const units = unitsFor(v, line, blocks);
    const rounded = Math.round(amount);
    return {
      food_id: line.food_id,
      name: line.food_snapshot.name,
      grams,
      amount,
      unit,
      rounded,
      units,
      delta_kcal: roundingDeltaKcal(v, line, blocks),
      zero: units !== null ? units === 0 : rounded === 0,
    };
  });
  return {
    lines,
    macros: scaleMacros(versionTotals(v), scaleFactor(v, blocks)),
    delta_kcal: lines.reduce((s, l) => s + l.delta_kcal, 0),
  };
}

/** Grammes (ou ml) par bloc pour chaque ingrédient. */
export function perBlock(v: Lines): PortionLine[] {
  return portion(v, 1).lines;
}

export type AggregatedLine = {
  food_id: string;
  name: string;
  grams: number;
  /** Total en ml si toutes les lignes de cet aliment sont saisies en ml, sinon en g. */
  amount: number;
  unit: Unit;
  units: number | null;
  delta_kcal: number;
};

type Acc = AggregatedLine & { allMl: boolean; density: number };

export function aggregate(items: { version: Lines; blocks: number }[]): AggregatedLine[] {
  const map = new Map<string, Acc>();
  for (const { version, blocks } of items) {
    const p = portion(version, blocks);
    p.lines.forEach((pl, i) => {
      const src = version.lines[i];
      const density = src ? densityOf(src.food_snapshot) : 1;
      const cur = map.get(pl.food_id);
      if (!cur) {
        map.set(pl.food_id, {
          food_id: pl.food_id,
          name: pl.name,
          grams: pl.grams,
          amount: 0,
          unit: 'g',
          units: pl.units,
          delta_kcal: pl.delta_kcal,
          allMl: pl.unit === 'ml',
          density,
        });
      } else {
        cur.grams += pl.grams;
        cur.allMl = cur.allMl && pl.unit === 'ml';
        cur.units = cur.units === null || pl.units === null ? null : cur.units + pl.units;
        cur.delta_kcal += pl.delta_kcal;
      }
    });
  }
  return [...map.values()]
    .map(({ allMl, density, ...a }): AggregatedLine => ({
      ...a,
      unit: allMl ? 'ml' : 'g',
      amount: allMl ? a.grams / density : a.grams,
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
