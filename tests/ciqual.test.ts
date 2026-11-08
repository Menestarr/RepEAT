import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRows, decodeXml, parseTeneur } from '../scripts/ciqual-parse';
import { flagsToKeys, fromRow, normalize, type CiqualRow } from '../src/ciqual/format';
import { buildIndex, search } from '../src/ciqual/search';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseTeneur', () => {
  it('décimales à virgule', () => {
    expect(parseTeneur(' 12,5 ')).toEqual({ value: 12.5, flagged: false });
    expect(parseTeneur(' 899 ')).toEqual({ value: 899, flagged: false });
  });
  it('valeurs non numériques : null + flag', () => {
    for (const v of [' - ', ' traces ', ' &lt; 0,5 ', '', '   ', undefined]) {
      expect(parseTeneur(v)).toEqual({ value: null, flagged: true });
    }
  });
  it('entités XML', () => {
    expect(decodeXml('Jus d&apos;orange &amp; co')).toBe("Jus d'orange & co");
  });
});

describe('build-ciqual sur un échantillon du XML 2025', () => {
  const rows = buildRows(fixture('alim_sample.xml'), fixture('compo_sample.xml'));
  const byCode = new Map(rows.map((r) => [r[0], r]));

  it('lit les aliments avec BOM et entités', () => {
    expect(rows).toHaveLength(3);
    expect(byCode.get('2013')?.[1]).toBe("Jus d'orange, frais");
  });
  it('colonnes kcal (328), protéines N×6,25 (25003), glucides (31000), lipides (40000)', () => {
    const row = byCode.get('17270') as CiqualRow;
    expect(row.slice(3, 7)).toEqual([899, 0.25, null, 99.9]);
    expect(flagsToKeys(row[7])).toEqual(['carb']);
  });
  it('zéros conservés comme valeurs, sans flag', () => {
    const row = byCode.get('1000') as CiqualRow;
    expect(row.slice(3, 8)).toEqual([274, 0, 2.86, 0, 0]);
  });
  it('nom normalisé', () => {
    expect(byCode.get('17270')?.[2]).toBe('huile d olive vierge extra');
  });
});

describe('recherche', () => {
  const items = [
    'Huile d\'olive vierge extra',
    'Olive noire, à l\'huile',
    'Pâtes alimentaires, cuites',
    'Œuf, cru',
    'Bœuf, steak haché 5% MG, cru',
    'Pâté de campagne',
  ].map((name, i) => fromRow([String(i), name, normalize(name), 100, 1, 1, 1, 0]));
  const index = buildIndex(items);
  const names = (q: string) => search(index, q).map((x) => x.name);

  it('tolérante aux accents et à la casse', () => {
    expect(names('PATES')[0]).toBe('Pâtes alimentaires, cuites');
    expect(names('oeuf')).toEqual(['Œuf, cru']);
    expect(names('boeuf hache')).toEqual(['Bœuf, steak haché 5% MG, cru']);
  });
  it('tokens dans n\'importe quel ordre, nom commençant par le premier mot en tête', () => {
    expect(names('huile olive')).toEqual(["Huile d'olive vierge extra", "Olive noire, à l'huile"]);
    expect(names('olive huile')[0]).toBe("Olive noire, à l'huile");
  });
  it('préfixes', () => {
    expect(names('pat')).toEqual(['Pâté de campagne', 'Pâtes alimentaires, cuites']);
  });
  it('requête vide', () => {
    expect(names('  ')).toEqual([]);
  });
  it('aucun résultat', () => {
    expect(names('chocolat')).toEqual([]);
  });
});
