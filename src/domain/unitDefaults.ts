/**
 * Valeurs d'unité indicatives des aliments Ciqual (SPEC v1.1 §4.3).
 *
 * Appliquées à la copie d'un aliment Ciqual, ou proposées par un bouton pour un
 * aliment copié en v1. Aucune valeur n'est inventée hors de cette table :
 * un fruit frais inconnu reçoit seulement le pas ½ (son poids reste à saisir).
 *
 * La reconnaissance se fait sur le nom normalisé découpé en mots, comme la
 * recherche Ciqual : « Bœuf » (« boeuf ») ne déclenche donc pas « œuf » (« oeuf »).
 */
import { normalize } from '../ciqual/format';
import type { Food, UnitStep } from './types';

/** Sous-groupes Ciqual (alim_ssgrp_code) utilisés par les règles. */
export const SSGRP_FRUITS = '0204';
export const SSGRP_EGGS = '0410';

export type UnitDefaults = Required<Pick<Food, 'unit_step'>> & Partial<Pick<Food, 'unit_weight_g' | 'unit_label'>>;

type Pattern = {
  /** Premier mot du nom normalisé (« clementine ou mandarine » : deux entrées). */
  firstWords: string[];
  weight: number;
  step: UnitStep;
  label: string;
};

/** Liste initiale, à ajuster à l'usage. Poids de la partie comestible. */
const PATTERNS: readonly Pattern[] = [
  { firstWords: ['avocat'], weight: 140, step: 0.5, label: 'avocat' },
  { firstWords: ['banane'], weight: 120, step: 0.5, label: 'banane' },
  { firstWords: ['pomme'], weight: 150, step: 0.5, label: 'pomme' },
  { firstWords: ['poire'], weight: 150, step: 0.5, label: 'poire' },
  { firstWords: ['orange'], weight: 140, step: 0.5, label: 'orange' },
  { firstWords: ['clementine', 'mandarine'], weight: 60, step: 0.5, label: 'clémentine' },
  { firstWords: ['kiwi'], weight: 75, step: 0.5, label: 'kiwi' },
  { firstWords: ['peche', 'nectarine'], weight: 130, step: 0.5, label: 'pêche' },
  { firstWords: ['abricot'], weight: 40, step: 0.5, label: 'abricot' },
  { firstWords: ['oeuf'], weight: 50, step: 1, label: 'œuf' },
];

/** Œufs : parties d'œuf, autres espèces, préparations pesées. */
const EGG_EXCLUDED = new Set(['blanc', 'jaune', 'poudre', 'caille', 'cane', 'oie', 'dinde', 'brouille']);

/** Fruits secs ou séchés : en 0204 mais se pèsent (« Banane, sèche », « Pomme, séchée »). */
function isDried(tokens: string[]): boolean {
  return tokens.some((t) => t === 'sec' || t === 'seche' || t === 'seches' || t.startsWith('sechee'));
}

function isRaw(tokens: string[]): boolean {
  return tokens.includes('cru') || tokens.includes('crue');
}

/** Fruits locaux de la Martinique : variétés différentes, le poids de la liste ne s'applique pas. */
function isRegionalSample(tokens: string[]): boolean {
  return tokens.includes('martinique');
}

export type CiqualIdentity = { name: string; ssgrp?: string };

/**
 * Valeurs indicatives d'un aliment Ciqual, ou null si aucune règle ne s'applique.
 * `ssgrp` absent (aliment non Ciqual) : aucune valeur, la règle en dépend.
 */
export function unitDefaultsFor(c: CiqualIdentity): UnitDefaults | null {
  if (!c.ssgrp) return null;
  const tokens = normalize(c.name).split(' ').filter(Boolean);
  const first = tokens[0] ?? '';
  const pattern = PATTERNS.find((p) => p.firstWords.includes(first));
  const full = (p: Pattern): UnitDefaults => ({ unit_step: p.step, unit_weight_g: p.weight, unit_label: p.label });

  // Avocat : classé en légumes (0201) par Ciqual, reconnu par son nom seul.
  if (first === 'avocat' && pattern) return full(pattern);

  if (c.ssgrp === SSGRP_EGGS) {
    if (first !== 'oeuf' || !pattern || tokens.some((t) => EGG_EXCLUDED.has(t))) return null;
    return full(pattern);
  }

  if (c.ssgrp === SSGRP_FRUITS && isRaw(tokens) && !isDried(tokens)) {
    // Tout fruit frais : pas ½, même hors de la liste.
    if (!pattern || isRegionalSample(tokens)) return { unit_step: 0.5 };
    return full(pattern);
  }
  return null;
}

/** Champs à écrire sur l'aliment : valeurs indicatives, signalées comme telles. */
export function indicativeFields(d: UnitDefaults | null): Partial<Food> {
  return d ? { ...d, unit_indicative: true } : {};
}
