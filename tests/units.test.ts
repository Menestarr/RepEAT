import { describe, expect, it } from 'vitest';
import { fmtHalves, formatAmount, formatParts, formatSpoons, hintFor, pluralize, splitSpoons } from '../src/domain/amountFormat';
import { isStrongRounding, roundAmount, roundHalfUp, stepFor } from '../src/domain/rounding';
import { availableUnits, defaultUnit, tablespoonGrams, toGrams } from '../src/domain/units';
import { validateLines } from '../src/domain/validation';
import { line, snap } from './helpers';

const AVOCAT = snap({ name: 'Avocat', unit_weight_g: 140, unit_label: 'avocat', unit_step: 0.5 });

describe('conversion en grammes', () => {
  it('chaque unité, avec et sans densité', () => {
    const s = snap();
    const huile = snap({ density_g_ml: 0.92 });
    expect(toGrams({ unit: 'g', value: 37 }, s)).toBe(37);
    expect(toGrams({ unit: 'ml', value: 100 }, s)).toBe(100);
    expect(toGrams({ unit: 'ml', value: 100 }, huile)).toBeCloseTo(92);
    expect(toGrams({ unit: 'cac', value: 2 }, s)).toBe(10);
    expect(toGrams({ unit: 'cac', value: 1 }, huile)).toBeCloseTo(4.6);
    expect(toGrams({ unit: 'cas', value: 1 }, s)).toBe(15);
    expect(toGrams({ unit: 'cas', value: 1 }, snap({ density_g_ml: 0.55 }))).toBeCloseTo(8.25);
    expect(toGrams({ unit: 'u', value: 1.5 }, AVOCAT)).toBe(210);
    expect(toGrams({ unit: 'pincee', value: 2 }, s)).toBe(1);
  });
  it('u sans poids unitaire : NaN, jamais une valeur fausse', () => {
    expect(toGrams({ unit: 'u', value: 1 }, snap())).toBeNaN();
  });
  it('poids d\'une c. à soupe affiché à côté de la densité', () => {
    expect(tablespoonGrams({ density_g_ml: 0.55 })).toBeCloseTo(8.25);
    expect(tablespoonGrams({})).toBe(15);
  });
});

describe('unités proposées', () => {
  it('u seulement avec un poids unitaire, pincée en dernier', () => {
    expect(availableUnits(snap())).toEqual(['g', 'ml', 'cac', 'cas', 'pincee']);
    expect(availableUnits(AVOCAT)[0]).toBe('u');
    expect(availableUnits(AVOCAT).at(-1)).toBe('pincee');
  });
  it('unité par défaut : u, cas pour une huile, sinon g', () => {
    expect(defaultUnit({ name: 'Avocat', unit_weight_g: 140 })).toBe('u');
    expect(defaultUnit({ name: "Huile d'olive vierge extra" })).toBe('cas');
    expect(defaultUnit({ name: 'Olive noire, à l\'huile' })).toBe('cas');
    expect(defaultUnit({ name: 'Riz' })).toBe('g');
  });
});

describe('validation des unités', () => {
  it('u refusé sans poids unitaire', () => {
    expect(validateLines([line({ unit: 'u', quantity: 1 })]).join(' ')).toMatch(/poids unitaire/);
    expect(validateLines([line({ unit: 'u', quantity: 1, snapshot: AVOCAT })])).toEqual([]);
  });
  it('versions v1 (g, ml) toujours valides', () => {
    expect(validateLines([line(), line({ food_id: 'l', unit: 'ml' })])).toEqual([]);
  });
});

describe('arrondi', () => {
  const g = (value: number) => roundAmount({ unit: 'g', value }, {}).value;

  it('demi vers le haut, flottants neutralisés', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.4999999999)).toBe(3);
    expect(roundHalfUp(2.49)).toBe(2);
  });
  it('g et ml : 1 sous 100, 5 à partir de 100 (seuil sur la quantité exacte)', () => {
    expect(g(37.2)).toBe(37);
    expect(g(99.4)).toBe(99);
    expect(g(99.6)).toBe(100);
    expect(g(100)).toBe(100);
    expect(g(102.4)).toBe(100);
    expect(g(102.5)).toBe(105);
    expect(g(143)).toBe(145);
    expect(roundAmount({ unit: 'ml', value: 143 }, {}).value).toBe(145);
    expect(stepFor({ unit: 'g', value: 99.9 }, {})).toBe(1);
  });
  it('jamais 0 : plancher à un pas', () => {
    expect(g(0.2)).toBe(1);
    expect(roundAmount({ unit: 'u', value: 0.1 }, { unit_step: 0.5 }).value).toBe(0.5);
    expect(roundAmount({ unit: 'cac', value: 0.1 }, {}).value).toBe(0.5);
    expect(roundAmount({ unit: 'pincee', value: 0.2 }, {}).value).toBe(1);
    expect(g(0)).toBe(0);
  });
  it('u : pas de l\'aliment', () => {
    expect(roundAmount({ unit: 'u', value: 0.33 }, { unit_step: 0.5 }).value).toBe(0.5);
    expect(roundAmount({ unit: 'u', value: 1.4 }, {}).value).toBe(1);
    expect(roundAmount({ unit: 'u', value: 1.5 }, {}).value).toBe(2);
  });
  it('cuillères : en c. à café, au ½', () => {
    // 1,3 c. à soupe = 3,9 c. à café → 4
    expect(roundAmount({ unit: 'cas', value: 1.3 }, {})).toEqual({ unit: 'cac', value: 4 });
    expect(roundAmount({ unit: 'cac', value: 2.4 }, {})).toEqual({ unit: 'cac', value: 2.5 });
  });
  it('arrondi fort au-delà de +50 %', () => {
    expect(isStrongRounding(0.2, 0.5)).toBe(true);
    expect(isStrongRounding(0.34, 0.5)).toBe(false);
    expect(isStrongRounding(1.4, 1)).toBe(false);
  });
});

describe('affichage', () => {
  it('demis en ½', () => {
    expect(fmtHalves(0.5)).toBe('½');
    expect(fmtHalves(1.5)).toBe('1 ½');
    expect(fmtHalves(2)).toBe('2');
  });
  it('cuillères décomposées en c. à soupe + c. à café', () => {
    expect(splitSpoons(4)).toEqual({ tbsp: 1, tsp: 1 });
    expect(formatSpoons(2.5)).toBe('2 ½ c. à café');
    expect(formatSpoons(3.5)).toBe('1 c. à soupe + ½ c. à café');
    expect(formatSpoons(4)).toBe('1 c. à soupe + 1 c. à café');
    expect(formatSpoons(6)).toBe('2 c. à soupe');
    expect(formatSpoons(0.5)).toBe('½ c. à café');
    expect(formatAmount({ unit: 'cas', value: 1.5 }, {})).toBe('1 c. à soupe + 1 ½ c. à café');
  });
  it('unités avec libellé, pluriel à partir de 2', () => {
    expect(formatAmount({ unit: 'u', value: 0.5 }, AVOCAT)).toBe('½ avocat');
    expect(formatAmount({ unit: 'u', value: 1.5 }, AVOCAT)).toBe('1 ½ avocat');
    expect(formatAmount({ unit: 'u', value: 2 }, AVOCAT)).toBe('2 avocats');
    expect(formatAmount({ unit: 'u', value: 3 }, {})).toBe('3 unités');
    expect(pluralize('noix', 3)).toBe('noix');
    expect(formatAmount({ unit: 'pincee', value: 2 }, {})).toBe('2 pincées');
    expect(formatAmount({ unit: 'g', value: 145 }, {})).toBe('145 g');
  });
  it('aliment à l\'unité en g : poids d\'une unité rappelé', () => {
    expect(hintFor([{ unit: 'g', value: 180 }], AVOCAT)).toBe('1 avocat = 140 g');
    expect(hintFor([{ unit: 'u', value: 1 }], AVOCAT)).toBeNull();
    expect(hintFor([{ unit: 'g', value: 180 }], snap())).toBeNull();
  });
  it('totaux multi-unités', () => {
    expect(formatParts([{ unit: 'cac', value: 6 }, { unit: 'g', value: 20 }], {})).toBe('2 c. à soupe + 20 g');
    expect(formatParts([{ unit: 'u', value: 1 }, { unit: 'g', value: 60 }], AVOCAT)).toBe('1 avocat + 60 g');
  });
});
