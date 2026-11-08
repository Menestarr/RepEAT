import { describe, expect, it } from 'vitest';
import { safeReturnPath, withoutParam, withParam, withReturn } from '../src/ui/paths';

describe('paramètre retour', () => {
  it('seulement un chemin interne', () => {
    expect(safeReturnPath('/recette/new?brouillon=abc')).toBe('/recette/new?brouillon=abc');
    expect(safeReturnPath('https://exemple.fr')).toBeNull();
    expect(safeReturnPath('//exemple.fr')).toBeNull();
    expect(safeReturnPath('/\\exemple.fr')).toBeNull();
    expect(safeReturnPath('')).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
  });
  it('encodé dans le lien, relu tel quel', () => {
    const link = withReturn('/aliment/f1', '/recette/new?brouillon=abc');
    expect(link).toBe('/aliment/f1?retour=%2Frecette%2Fnew%3Fbrouillon%3Dabc');
    expect(new URLSearchParams(link.split('?')[1]).get('retour')).toBe('/recette/new?brouillon=abc');
  });
  it('ajout et retrait de paramètres', () => {
    expect(withParam('/recette/new?brouillon=abc', 'ajout', 'f2')).toBe('/recette/new?brouillon=abc&ajout=f2');
    expect(withParam('/recette/r1', 'ajout', 'f2')).toBe('/recette/r1?ajout=f2');
    expect(withoutParam('/recette/new?brouillon=abc&ajout=f2', 'ajout')).toBe('/recette/new?brouillon=abc');
    expect(withoutParam('/recette/r1?ajout=f2', 'ajout')).toBe('/recette/r1');
  });
});
