import { describe, expect, it } from 'vitest';
import { addDays, isIsoDate } from '../src/domain/dates';
import { parseNumber } from '../src/domain/format';
import {
  defaultDensity,
  isMultipleOf,
  validateBlocks,
  validateFood,
  validateKcalTarget,
  validateLines,
  validateQuantity,
} from '../src/domain/validation';
import { activePhase, currentVersion, sortVersions, versionNumber } from '../src/domain/versions';
import { line, phase, T0, T1 } from './helpers';

describe('contraintes', () => {
  it('blocs : multiples de 0,5 et > 0', () => {
    expect(validateBlocks(0.5)).toBeNull();
    expect(validateBlocks(3)).toBeNull();
    expect(validateBlocks(0)).not.toBeNull();
    expect(validateBlocks(-1)).not.toBeNull();
    expect(validateBlocks(0.25)).not.toBeNull();
    expect(validateBlocks(NaN)).not.toBeNull();
  });
  it('cible : multiple de 50', () => {
    expect(validateKcalTarget(1900)).toBeNull();
    expect(validateKcalTarget(1950)).toBeNull();
    expect(validateKcalTarget(1920)).not.toBeNull();
    expect(validateKcalTarget(0)).not.toBeNull();
  });
  it('quantité > 0', () => {
    expect(validateQuantity(0.1)).toBeNull();
    expect(validateQuantity(0)).not.toBeNull();
  });
  it('isMultipleOf tolère le flottant', () => {
    expect(isMultipleOf(0.1 + 0.2 + 0.2, 0.5)).toBe(true);
  });
  it('lignes : aliment sans kcal refusé', () => {
    expect(validateLines([line({ snapshot: { kcal_100g: null } })]).length).toBeGreaterThan(0);
  });
  it('lignes : total nul refusé', () => {
    expect(validateLines([line({ snapshot: { kcal_100g: 0 } })])).toEqual([
      'Le total de kcal de la recette doit être strictement positif.',
    ]);
  });
  it('lignes : recette vide refusée', () => {
    expect(validateLines([]).length).toBe(1);
  });
  it('lignes valides', () => {
    expect(validateLines([line()])).toEqual([]);
  });
  it('aliment', () => {
    const base = { name: 'X', kcal_100g: 100, prot_100g: null, carb_100g: null, fat_100g: null };
    expect(validateFood(base)).toEqual([]);
    expect(validateFood({ ...base, name: ' ' }).length).toBe(1);
    expect(validateFood({ ...base, kcal_100g: -1 }).length).toBe(1);
    expect(validateFood({ ...base, unit_weight_g: 0 }).length).toBe(1);
    expect(validateFood({ ...base, unit_weight_g: 50, unit_step: 0.5 })).toEqual([]);
    expect(validateFood({ ...base, density_g_ml: 0 }).length).toBe(1);
  });
  it('densité par défaut des huiles', () => {
    expect(defaultDensity("Huile d'olive vierge extra")).toBe(0.92);
    expect(defaultDensity('Huiles végétales')).toBe(0.92);
    expect(defaultDensity('Riz blanc')).toBeUndefined();
  });
});

describe('versions', () => {
  const a = { id: 'b', created_at: T0 };
  const b = { id: 'a', created_at: T1 };
  const c = { id: 'c', created_at: T1 };
  it('tri par created_at puis id', () => {
    expect(sortVersions([c, b, a]).map((v) => v.id)).toEqual(['b', 'a', 'c']);
  });
  it('version courante = la plus récente', () => {
    expect(currentVersion([a, c, b])?.id).toBe('c');
    expect(currentVersion([])).toBeUndefined();
  });
  it('numéro dérivé', () => {
    expect(versionNumber([a, b, c], 'c')).toBe(3);
    expect(versionNumber([a, b, c], 'b')).toBe(1);
    expect(versionNumber([a], 'zz')).toBe(0);
  });
});

describe('phases', () => {
  const p1 = phase({ id: 'p1', start_date: '2026-10-01', kcal_target: 2200 });
  const p2 = phase({ id: 'p2', start_date: '2026-11-01', kcal_target: 1900 });
  it('phase active = la plus récente avec start_date <= date', () => {
    expect(activePhase([p1, p2], '2026-10-15')?.id).toBe('p1');
    expect(activePhase([p1, p2], '2026-11-01')?.id).toBe('p2');
    expect(activePhase([p2, p1], '2026-12-25')?.id).toBe('p2');
  });
  it('aucune phase avant la première', () => {
    expect(activePhase([p1, p2], '2026-09-30')).toBeUndefined();
  });
  it('phases supprimées ignorées', () => {
    expect(activePhase([p1, { ...p2, deleted_at: T1 }], '2026-11-05')?.id).toBe('p1');
  });
});

describe('utilitaires', () => {
  it('dates', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('nombres saisis en français', () => {
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber(' ')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber(3)).toBe(3);
  });
});
