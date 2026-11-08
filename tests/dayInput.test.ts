import { describe, expect, it } from 'vitest';
import { fillRemaining, kcalToBlocks, parseKcalInput } from '../src/domain/dayInput';
import { draftLabel, isExpired, restoreDraftLines, untitledLabels } from '../src/domain/drafts';
import { T0, T1, T2, food } from './helpers';

describe('saisie des kcal', () => {
  it('arrondi au demi-bloc, demi vers le haut', () => {
    expect(kcalToBlocks(230)).toBe(2.5);
    expect(kcalToBlocks(220)).toBe(2);
    expect(kcalToBlocks(225)).toBe(2.5);
    expect(kcalToBlocks(250)).toBe(2.5);
  });
  it('interprétation : valeur, arrondi signalé, 0 retire, invalide refusée', () => {
    expect(parseKcalInput('250')).toEqual({ kind: 'set', blocks: 2.5, adjusted: false });
    expect(parseKcalInput('230')).toEqual({ kind: 'set', blocks: 2.5, adjusted: true });
    expect(parseKcalInput('0')).toEqual({ kind: 'remove' });
    expect(parseKcalInput('20')).toEqual({ kind: 'remove' });
    expect(parseKcalInput('')).toEqual({ kind: 'invalid' });
    expect(parseKcalInput('-50')).toEqual({ kind: 'invalid' });
    expect(parseKcalInput('abc')).toEqual({ kind: 'invalid' });
  });
  it('« = reste » : valeur + reste, au demi-bloc inférieur', () => {
    expect(fillRemaining(2, 320)).toBe(5);
    expect(fillRemaining(2, 30)).toBeNull(); // ne changerait rien
    expect(fillRemaining(2, 0)).toBeNull();
    expect(fillRemaining(2, -100)).toBeNull();
  });
});

describe('brouillons', () => {
  const d = (id: string, created_at: string, p: { name?: string; recipe_id?: string } = {}) => ({ id, created_at, name: p.name ?? '', ...p });

  it('« Sans nom (n) » dans l\'ordre de création', () => {
    const labels = untitledLabels([d('c', T2), d('a', T0), d('b', T1), d('n', T0, { name: 'Bol' }), d('r', T0, { recipe_id: 'r1' })]);
    expect([...labels.entries()]).toEqual([
      ['a', 'Sans nom'],
      ['b', 'Sans nom (1)'],
      ['c', 'Sans nom (2)'],
    ]);
    expect(draftLabel({ id: 'n', name: 'Bol' }, labels)).toBe('Bol');
    expect(draftLabel({ id: 'b', name: ' ' }, labels)).toBe('Sans nom (1)');
  });
  it('purge au-delà de 30 jours', () => {
    expect(isExpired({ updated_at: '2026-10-01T00:00:00.000Z' }, '2026-11-08T00:00:00.000Z')).toBe(true);
    expect(isExpired({ updated_at: '2026-10-20T00:00:00.000Z' }, '2026-11-08T00:00:00.000Z')).toBe(false);
  });
  it('restauration : aliment relu, supprimé retiré, u sans poids repassé en g', () => {
    const banane = food({ id: 'b', name: 'Banane' }); // a perdu son poids unitaire
    const riz = food({ id: 'r', kcal_100g: 350 });
    const parti = food({ id: 'x', name: 'Parti', deleted_at: T1 });
    const out = restoreDraftLines(
      [
        { food_id: 'r', quantity: '100', unit: 'g' },
        { food_id: 'b', quantity: '1,5', unit: 'u' },
        { food_id: 'x', quantity: '10', unit: 'g' },
        { food_id: 'inconnu', quantity: '10', unit: 'g' },
      ],
      new Map([
        ['r', riz],
        ['b', banane],
        ['x', parti],
      ]),
    );
    expect(out.lines.map((l) => [l.food.id, l.quantity, l.unit, l.unitReset])).toEqual([
      ['r', '100', 'g', false],
      ['b', '1,5', 'g', true],
    ]);
    expect(out.removed).toEqual(['Parti', 'inconnu']);
  });
});
