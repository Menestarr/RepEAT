import { describe, expect, it } from 'vitest';
import {
  aggregate,
  CalcError,
  daySummary,
  displayFor,
  gramsFor,
  lineGrams,
  perBlock,
  portion,
  roundingDeltaKcal,
  unitsFor,
  versionBlocks,
  versionTotals,
} from '../src/domain/calc';
import { line, version } from './helpers';

describe('grams / kcal', () => {
  it('g : quantité telle quelle', () => {
    expect(lineGrams(line({ quantity: 150 }))).toBe(150);
  });
  it('ml : quantité × densité', () => {
    expect(lineGrams(line({ quantity: 100, unit: 'ml', snapshot: { density_g_ml: 0.92 } }))).toBeCloseTo(92);
  });
  it('ml sans densité : densité 1', () => {
    expect(lineGrams(line({ quantity: 250, unit: 'ml' }))).toBe(250);
  });
  it('densité nulle ou négative ignorée (1)', () => {
    expect(lineGrams(line({ quantity: 10, unit: 'ml', snapshot: { density_g_ml: 0 } }))).toBe(10);
  });
  it('totaux et macros', () => {
    const v = version([
      line({ quantity: 200 }), // 700 kcal
      line({ food_id: 'f-huile', quantity: 10, snapshot: { name: 'Huile', kcal_100g: 900, prot_100g: 0, carb_100g: 0, fat_100g: 100 } }),
    ]);
    const t = versionTotals(v);
    expect(t.kcal).toBeCloseTo(790);
    expect(t.prot).toBeCloseTo(14);
    expect(t.carb).toBeCloseTo(156);
    expect(t.fat).toBeCloseTo(12);
    expect(versionBlocks(v)).toBeCloseTo(7.9);
  });
  it('macros null comptées à 0', () => {
    const v = version([line({ snapshot: { prot_100g: null, carb_100g: null } })]);
    expect(versionTotals(v).prot).toBe(0);
    expect(versionTotals(v).carb).toBe(0);
  });
});

describe('grams_for / display_for', () => {
  it('1 bloc de riz à 350 kcal = 28,57 g', () => {
    const v = version([line({ quantity: 300 })]);
    expect(gramsFor(v, v.lines[0]!, 1)).toBeCloseTo(100 / 3.5);
  });
  it('proportions conservées sur plusieurs ingrédients', () => {
    const riz = line({ quantity: 100 }); // 350
    const poulet = line({ food_id: 'f-p', quantity: 150, snapshot: { name: 'Poulet', kcal_100g: 100 } }); // 150
    const v = version([riz, poulet]); // 500 kcal = 5 blocs
    expect(gramsFor(v, riz, 5)).toBeCloseTo(100);
    expect(gramsFor(v, poulet, 5)).toBeCloseTo(150);
    expect(gramsFor(v, poulet, 2.5)).toBeCloseTo(75);
  });
  it('demi-bloc d\'huile d\'olive ≈ 5,6 g', () => {
    const v = version([line({ quantity: 100, snapshot: { kcal_100g: 899 } })]);
    expect(gramsFor(v, v.lines[0]!, 1)).toBeCloseTo(11.12, 1);
    expect(gramsFor(v, v.lines[0]!, 0.5)).toBeCloseTo(5.56, 1);
  });
  it('ml : affichage reconverti en ml', () => {
    const lait = line({ quantity: 200, unit: 'ml', snapshot: { name: 'Lait', kcal_100g: 50, density_g_ml: 1.03 } });
    const v = version([lait]); // 206 g → 103 kcal
    const d = displayFor(v, lait, 1);
    expect(d.unit).toBe('ml');
    expect(d.amount).toBeCloseTo(200 / 1.03);
    expect(gramsFor(v, lait, 1)).toBeCloseTo(200);
  });
  it('total nul : erreur', () => {
    const v = version([line({ snapshot: { kcal_100g: 0 } })]);
    expect(() => gramsFor(v, v.lines[0]!, 1)).toThrow(CalcError);
  });
});

describe('aliments à l\'unité', () => {
  const oeuf = line({
    food_id: 'f-oeuf',
    quantity: 100,
    snapshot: { name: 'Œuf', kcal_100g: 140, is_unit_item: true, unit_weight_g: 50 },
  });
  const v = version([oeuf]); // 140 kcal pour 100 g

  it('units_for arrondi', () => {
    // 3 blocs = 214,3 g = 4,29 œufs → 4
    expect(unitsFor(v, oeuf, 3)).toBe(4);
    // 1 bloc = 71,4 g = 1,43 → 1
    expect(unitsFor(v, oeuf, 1)).toBe(1);
  });
  it('écart d\'arrondi en kcal', () => {
    // 4 × 50 = 200 g au lieu de 214,29 → -14,29 g × 1,4 = -20 kcal
    expect(roundingDeltaKcal(v, oeuf, 3)).toBeCloseTo(-20, 5);
    // 1,5 bloc = 107,14 g = 2,14 → 2 → -7,14 g → -10 kcal
    expect(roundingDeltaKcal(v, oeuf, 1.5)).toBeCloseTo(-10, 5);
  });
  it('arrondi au-dessus : écart positif', () => {
    // 2 blocs = 142,86 g = 2,857 → 3 œufs = 150 g → +10 kcal
    expect(unitsFor(v, oeuf, 2)).toBe(3);
    expect(roundingDeltaKcal(v, oeuf, 2)).toBeCloseTo(10, 5);
  });
  it('à l\'unité sans poids unitaire : traité au poids', () => {
    const x = line({ snapshot: { is_unit_item: true } });
    const vx = version([x]);
    expect(unitsFor(vx, x, 1)).toBeNull();
    expect(roundingDeltaKcal(vx, x, 1)).toBe(0);
  });
  it('non unitaire : pas d\'unités, pas d\'écart', () => {
    const vr = version([line()]);
    expect(unitsFor(vr, vr.lines[0]!, 1)).toBeNull();
    expect(roundingDeltaKcal(vr, vr.lines[0]!, 1)).toBe(0);
  });
  it('0 unité signalée', () => {
    const tiny = line({ food_id: 'f-o', quantity: 50, snapshot: { name: 'Œuf', kcal_100g: 140, is_unit_item: true, unit_weight_g: 50 } });
    const big = line({ quantity: 1000 });
    const vv = version([tiny, big]);
    const p = portion(vv, 1);
    expect(p.lines[0]!.units).toBe(0);
    expect(p.lines[0]!.zero).toBe(true);
  });
});

describe('portion', () => {
  it('signale un ingrédient à 0 g', () => {
    const sel = line({ food_id: 'f-sel', quantity: 1, snapshot: { name: 'Sel', kcal_100g: 0 } });
    const v = version([line({ quantity: 500 }), sel]);
    const p = portion(v, 1);
    expect(p.lines[1]!.rounded).toBe(0);
    expect(p.lines[1]!.zero).toBe(true);
    expect(p.lines[0]!.zero).toBe(false);
  });
  it('macros proportionnelles et kcal = blocs × 100', () => {
    const v = version([line({ quantity: 200 })]);
    const p = portion(v, 3);
    expect(p.macros.kcal).toBeCloseTo(300);
    expect(p.macros.prot).toBeCloseTo((300 / 700) * 14);
  });
  it('perBlock = portion à 1 bloc', () => {
    const v = version([line({ quantity: 200 })]);
    expect(perBlock(v)[0]!.grams).toBeCloseTo(100 / 3.5);
  });
  it('arrondi à l\'affichage seulement', () => {
    const v = version([line({ quantity: 100 })]);
    const p = portion(v, 1);
    expect(p.lines[0]!.amount).toBeCloseTo(28.571, 2);
    expect(p.lines[0]!.rounded).toBe(29);
  });
});

describe('aggregate', () => {
  it('somme par aliment sur plusieurs recettes', () => {
    const v1 = version([line({ quantity: 100 })], { id: 'a' });
    const v2 = version([line({ quantity: 100 }), line({ food_id: 'f-x', quantity: 100, snapshot: { name: 'X', kcal_100g: 100 } })], { id: 'b' });
    const agg = aggregate([
      { version: v1, blocks: 1 },
      { version: v2, blocks: 4.5 },
    ]);
    const riz = agg.find((a) => a.food_id === 'f-riz')!;
    // v2 : 450 kcal → ×1 → 100 g de riz
    expect(riz.grams).toBeCloseTo(100 / 3.5 + 100);
    expect(riz.unit).toBe('g');
  });
  it('ml conservé si toutes les lignes sont en ml', () => {
    const lait = line({ food_id: 'lait', quantity: 100, unit: 'ml', snapshot: { name: 'Lait', kcal_100g: 50, density_g_ml: 1.03 } });
    const agg = aggregate([
      { version: version([lait]), blocks: 1 },
      { version: version([lait]), blocks: 1 },
    ]);
    expect(agg[0]!.unit).toBe('ml');
    // 100 ml = 103 g = 51,5 kcal ; 1 bloc = 194,17 g = 188,52 ml… par recette, ×2
    expect(agg[0]!.amount).toBeCloseTo((2 * 10000) / 51.5, 5);
  });
  it('mélange g et ml : total en g', () => {
    const laitMl = line({ food_id: 'lait', quantity: 100, unit: 'ml', snapshot: { name: 'Lait', kcal_100g: 50 } });
    const laitG = line({ food_id: 'lait', quantity: 100, unit: 'g', snapshot: { name: 'Lait', kcal_100g: 50 } });
    const agg = aggregate([
      { version: version([laitMl]), blocks: 1 },
      { version: version([laitG]), blocks: 1 },
    ]);
    expect(agg[0]!.unit).toBe('g');
    expect(agg[0]!.amount).toBeCloseTo(400);
  });
  it('unités : somme des unités arrondies par recette', () => {
    const oeuf = line({ food_id: 'o', quantity: 100, snapshot: { name: 'Œuf', kcal_100g: 140, is_unit_item: true, unit_weight_g: 50 } });
    const agg = aggregate([
      { version: version([oeuf]), blocks: 3 },
      { version: version([oeuf]), blocks: 2 },
    ]);
    expect(agg[0]!.units).toBe(7);
    expect(agg[0]!.delta_kcal).toBeCloseTo(-10);
  });
});

describe('daySummary', () => {
  const v = version([line({ quantity: 100 })]);
  it('reste en blocs et en kcal', () => {
    const s = daySummary([{ version: v, blocks: 12.5 }, { version: v, blocks: 3 }], 1900);
    expect(s.total_kcal).toBe(1550);
    expect(s.remaining_kcal).toBe(350);
    expect(s.remaining_blocks).toBe(3.5);
    expect(s.target_blocks).toBe(19);
    expect(s.done).toBe(false);
  });
  it('vert quand le reste vaut 0', () => {
    const s = daySummary([{ version: v, blocks: 19 }], 1900);
    expect(s.done).toBe(true);
  });
  it('dépassement : reste négatif', () => {
    const s = daySummary([{ version: v, blocks: 20 }], 1950);
    expect(s.remaining_blocks).toBe(-0.5);
  });
  it('journée vide', () => {
    const s = daySummary([], 2000);
    expect(s.total_kcal).toBe(0);
    expect(s.remaining_blocks).toBe(20);
  });
});
