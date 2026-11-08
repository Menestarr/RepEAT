import { describe, expect, it } from 'vitest';
import {
  aggregate,
  CalcError,
  daySummary,
  exactAmountFor,
  gramsFor,
  lineGrams,
  perBlock,
  portion,
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
  it('ml : quantité exacte dans l\'unité de saisie', () => {
    const lait = line({ quantity: 200, unit: 'ml', snapshot: { name: 'Lait', kcal_100g: 50, density_g_ml: 1.03 } });
    const v = version([lait]); // 206 g → 103 kcal
    const d = exactAmountFor(v, lait, 1);
    expect(d.unit).toBe('ml');
    expect(d.value).toBeCloseTo(200 / 1.03);
    expect(gramsFor(v, lait, 1)).toBeCloseTo(200);
  });
  it('cuillères : quantité exacte normalisée en c. à café', () => {
    const huile = line({ quantity: 2, unit: 'cas', snapshot: { kcal_100g: 900, density_g_ml: 0.92 } });
    const d = exactAmountFor(version([huile]), huile, 1);
    expect(d.unit).toBe('cac');
    // 1 bloc = 11,11 g = 12,08 ml = 2,42 c. à café
    expect(d.value).toBeCloseTo(100 / 9 / 0.92 / 5, 5);
  });
  it('total nul : erreur', () => {
    const v = version([line({ snapshot: { kcal_100g: 0 } })]);
    expect(() => gramsFor(v, v.lines[0]!, 1)).toThrow(CalcError);
  });
});

describe('portion : arrondi dans l\'unité de saisie', () => {
  const OEUF = { name: 'Œuf', kcal_100g: 140, unit_weight_g: 50, unit_label: 'œuf' };
  const AVOCAT = { name: 'Avocat', kcal_100g: 200, unit_weight_g: 140, unit_label: 'avocat', unit_step: 0.5 as const };

  it('g : au gramme sous 100 g', () => {
    const v = version([line({ quantity: 100 })]); // 1 bloc = 28,57 g
    const l = portion(v, 1).lines[0]!;
    expect(l.exact.value).toBeCloseTo(28.571, 2);
    expect(l.rounded).toEqual({ unit: 'g', value: 29 });
  });
  it('g : pas de 5 à partir de 100 g', () => {
    const v = version([line({ quantity: 100 })]); // 5 blocs = 142,86 g
    expect(portion(v, 5).lines[0]!.rounded.value).toBe(145);
  });
  it('u : pas de l\'aliment, écart en kcal', () => {
    const oeuf = line({ food_id: 'o', quantity: 2, unit: 'u', snapshot: OEUF }); // 100 g = 140 kcal
    const v = version([oeuf]);
    // 3 blocs = 4,29 œufs → 4 ; 200 g au lieu de 214,29 → −20 kcal
    const l = portion(v, 3).lines[0]!;
    expect(l.rounded).toEqual({ unit: 'u', value: 4 });
    expect(l.delta_kcal).toBeCloseTo(-20, 5);
    // 2 blocs = 2,86 → 3 œufs → +10 kcal
    expect(portion(v, 2).lines[0]!.delta_kcal).toBeCloseTo(10, 5);
  });
  it('u au pas ½ : 0,34 avocat → ½ ; 0,15 → ½ signalé « arrondi fort »', () => {
    const avocat = line({ food_id: 'a', quantity: 1, unit: 'u', snapshot: AVOCAT }); // 280 kcal
    const riz = line({ quantity: 300 }); // 1050 kcal
    const v = version([avocat, riz]); // 1330 kcal
    const l = portion(v, 4.5).lines[0]!; // 450 / 1330 = 0,338 avocat
    expect(l.rounded).toEqual({ unit: 'u', value: 0.5 });
    expect(l.strong).toBe(false); // +48 % : sous le seuil de 50 %
    expect(l.delta_kcal).toBeCloseTo((0.5 - 450 / 1330) * 280, 5);
    const small = portion(v, 2).lines[0]!; // 0,15 avocat
    expect(small.rounded.value).toBe(0.5);
    expect(small.strong).toBe(true);
  });
  it('jamais 0 : plancher à un pas', () => {
    const sel = line({ food_id: 'f-sel', quantity: 1, snapshot: { name: 'Sel', kcal_100g: 0 } });
    const v = version([line({ quantity: 500 }), sel]);
    const l = portion(v, 1).lines[1]!; // 0,057 g
    expect(l.rounded.value).toBe(1);
    expect(l.strong).toBe(true);
  });
  it('aliment à l\'unité saisi en g : reste en g', () => {
    const banane = line({ food_id: 'b', quantity: 180, snapshot: { ...AVOCAT, name: 'Banane' } });
    const l = portion(version([banane]), 3.6).lines[0]!;
    expect(l.rounded).toEqual({ unit: 'g', value: 180 });
  });
  it('huile en cuillères (SPEC v1.1 §5.2 bis)', () => {
    const huile = line({ quantity: 1, unit: 'cas', snapshot: { name: 'Huile', kcal_100g: 900, density_g_ml: 0.92 } });
    const v = version([huile]);
    const at = (n: number) => portion(v, n).lines[0]!;
    expect(at(0.5).rounded).toEqual({ unit: 'cac', value: 1 });
    expect(at(1).rounded).toEqual({ unit: 'cac', value: 2.5 });
    expect(at(1.5).rounded).toEqual({ unit: 'cac', value: 3.5 });
    expect(at(2).rounded).toEqual({ unit: 'cac', value: 5 });
    // Écarts du tableau de la spec : −9, +4, −5, +7 kcal (à 1 kcal près).
    expect(Math.round(at(0.5).delta_kcal)).toBe(-9);
    expect(at(1).delta_kcal).toBeCloseTo(3.5, 0);
    expect(Math.round(at(1.5).delta_kcal)).toBe(-5);
    expect(Math.round(at(2).delta_kcal)).toBe(7);
  });
  it('macros proportionnelles et kcal = blocs × 100 (exactes, hors arrondi)', () => {
    const v = version([line({ quantity: 200 })]);
    const p = portion(v, 3);
    expect(p.macros.kcal).toBeCloseTo(300);
    expect(p.macros.prot).toBeCloseTo((300 / 700) * 14);
  });
  it('perBlock = portion à 1 bloc ; total des écarts', () => {
    const v = version([line({ quantity: 200 })]);
    expect(perBlock(v)[0]!.grams).toBeCloseTo(100 / 3.5);
    // 29 g au lieu de 28,57 g de riz à 350 kcal
    expect(portion(v, 1).delta_kcal).toBeCloseTo((29 - 100 / 3.5) * 3.5, 5);
  });
});

describe('aggregate (quantités arrondies, par unité)', () => {
  it('somme des quantités arrondies de chaque recette', () => {
    const v1 = version([line({ quantity: 100 })], { id: 'a' });
    const v2 = version([line({ quantity: 100 }), line({ food_id: 'f-x', quantity: 100, snapshot: { name: 'X', kcal_100g: 100 } })], { id: 'b' });
    const agg = aggregate([
      { version: v1, blocks: 1 }, // 28,57 → 29 g
      { version: v2, blocks: 4.5 }, // 100 g de riz → 100 g
    ]);
    const riz = agg.find((a) => a.food_id === 'f-riz')!;
    expect(riz.parts).toEqual([{ unit: 'g', value: 129 }]);
  });
  it('unités différentes : une part par unité, sans conversion ; cuillères additionnées', () => {
    const snapshot = { name: 'Huile', kcal_100g: 900, density_g_ml: 0.92 };
    const huileCas = line({ food_id: 'h', quantity: 1, unit: 'cas', snapshot });
    const huileCac = line({ food_id: 'h', quantity: 1, unit: 'cac', snapshot });
    const huileG = line({ food_id: 'h', quantity: 10, unit: 'g', snapshot });
    const agg = aggregate([
      { version: version([huileCas]), blocks: 2 }, // 5 c. à café
      { version: version([huileCac]), blocks: 1 }, // 2 ½ c. à café
      { version: version([huileG]), blocks: 2 }, // 22,2 → 22 g
    ]);
    expect(agg[0]!.parts).toEqual([
      { unit: 'cac', value: 7.5 },
      { unit: 'g', value: 22 },
    ]);
  });
  it('unités : somme des unités arrondies et des écarts', () => {
    const oeuf = line({ food_id: 'o', quantity: 2, unit: 'u', snapshot: { name: 'Œuf', kcal_100g: 140, unit_weight_g: 50 } });
    const agg = aggregate([
      { version: version([oeuf]), blocks: 3 }, // 4
      { version: version([oeuf]), blocks: 2 }, // 3
    ]);
    expect(agg[0]!.parts).toEqual([{ unit: 'u', value: 7 }]);
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
