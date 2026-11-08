import { describe, expect, it } from 'vitest';
import { unitDefaultsFor } from '../src/domain/unitDefaults';

/** Noms et sous-groupes réels de alim_2025_11_03.xml. */
const at = (name: string, ssgrp: string) => unitDefaultsFor({ name, ssgrp });

describe('pré-remplissage des unités', () => {
  it('fruits de la liste : poids, pas ½, libellé', () => {
    expect(at('Banane, chair sans peau, crue', '0204')).toEqual({ unit_step: 0.5, unit_weight_g: 120, unit_label: 'banane' });
    expect(at('Clémentine ou mandarine, chair sans peau, sans pépins, crue', '0204')?.unit_weight_g).toBe(60);
    expect(at('Nectarine ou brugnon, jaune, chair et peau, sans noyau, crue', '0204')?.unit_label).toBe('pêche');
    expect(at('Pomme Golden, chair et peau, crue', '0204')?.unit_weight_g).toBe(150);
  });
  it('tout fruit frais 0204 : pas ½, même hors liste (poids à saisir)', () => {
    expect(at('Fraise, crue', '0204')).toEqual({ unit_step: 0.5 });
  });
  it('avocat reconnu malgré le sous-groupe 0201 (légumes)', () => {
    expect(at('Avocat, chair sans peau, sans noyau, cru', '0201')).toEqual({ unit_step: 0.5, unit_weight_g: 140, unit_label: 'avocat' });
  });
  it('exclus : pomme de terre, fruits secs, compote, jus, cuits', () => {
    expect(at('Pomme de terre, sans peau, crue', '0202')).toBeNull();
    expect(at('Banane, chair sans peau, sèche', '0204')).toBeNull();
    expect(at('Pomme, séchée', '0204')).toBeNull();
    expect(at('Abricot, dénoyauté, sec', '0204')).toBeNull();
    expect(at('Compote de pomme', '0204')).toBeNull();
    expect(at("Jus d'orange, frais", '0602')).toBeNull();
    expect(at('Pomme, chair sans peau, rôtie/cuite au four', '0204')).toBeNull();
  });
  it('fruits de la Martinique : pas ½ sans le poids de la liste', () => {
    expect(at('Pomme cannelle, chair sans peau, sans pépins, crue, prélevée à la Martinique', '0204')).toEqual({ unit_step: 0.5 });
  });
  it('œufs entiers seulement (sous-groupe 0410)', () => {
    expect(at('Oeuf cru', '0410')).toEqual({ unit_step: 1, unit_weight_g: 50, unit_label: 'œuf' });
    expect(at('Oeuf dur', '0410')?.unit_weight_g).toBe(50);
    expect(at('Oeuf à la coque', '0410')?.unit_weight_g).toBe(50);
    expect(at("Oeuf, jaune (jaune d'oeuf), cru", '0410')).toBeNull();
    expect(at("Oeuf, blanc (blanc d'oeuf), cru", '0410')).toBeNull();
    expect(at('Oeuf de caille, cru', '0410')).toBeNull();
    expect(at('Oeuf, en poudre', '0410')).toBeNull();
    expect(at('Oeuf brouillé, avec matière grasse', '0410')).toBeNull();
  });
  it('« Bœuf » ne déclenche pas « œuf » (tokens)', () => {
    expect(at('Bœuf, steak haché 5% MG, cru', '0410')).toBeNull();
  });
  it('aliment non Ciqual (sans sous-groupe) : aucune valeur inventée', () => {
    expect(unitDefaultsFor({ name: 'Banane, crue' })).toBeNull();
  });
});
