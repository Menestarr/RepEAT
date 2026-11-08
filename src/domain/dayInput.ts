/**
 * Saisie des kcal dans la composition du jour (SPEC v1.1 §6 bis).
 * On stocke toujours des blocs, multiples de 0,5 (50 kcal) ; ce module convertit
 * une saisie en kcal en blocs, avec les mêmes règles partout.
 */
import { BLOCK_KCAL } from './calc';
import { parseNumber } from './format';
import { roundHalfUp } from './rounding';

/** Pas de saisie : un demi-bloc. */
export const HALF_BLOCK_KCAL = BLOCK_KCAL / 2;
/** Valeur proposée à l'ajout d'une recette depuis la recherche. */
export const DEFAULT_ADD_KCAL = BLOCK_KCAL;

/** blocks = round(kcal / 50) / 2, demi vers le haut (230 → 2,5 ; 220 → 2). */
export function kcalToBlocks(kcal: number): number {
  return roundHalfUp(kcal / HALF_BLOCK_KCAL) / 2;
}

export type KcalInput =
  /** Valeur vide ou invalide : on revient à la valeur précédente. */
  | { kind: 'invalid' }
  /** 0 (ou un arrondi à 0) : la recette est retirée de la journée. */
  | { kind: 'remove' }
  /** `adjusted` : la valeur saisie a été modifiée par l'arrondi (message à l'utilisateur). */
  | { kind: 'set'; blocks: number; adjusted: boolean };

/** Interprète la saisie d'un champ kcal (« 230 », « 250 », « 0 », « abc »). */
export function parseKcalInput(raw: string): KcalInput {
  const n = parseNumber(raw);
  if (n === null || n < 0) return { kind: 'invalid' };
  const blocks = kcalToBlocks(n);
  if (blocks === 0) return { kind: 'remove' };
  return { kind: 'set', blocks, adjusted: blocks * BLOCK_KCAL !== n };
}

/**
 * Raccourci « = reste » : valeur actuelle + reste, arrondie au demi-bloc inférieur
 * (reste 320, recette à 200 → 500). null si le raccourci ne change rien
 * (reste négatif, nul ou inférieur à un demi-bloc).
 */
export function fillRemaining(currentBlocks: number, remainingKcal: number): number | null {
  if (!(remainingKcal > 0)) return null;
  const total = currentBlocks * BLOCK_KCAL + remainingKcal;
  const blocks = Math.floor(total / HALF_BLOCK_KCAL + 1e-9) / 2;
  return blocks > currentBlocks ? blocks : null;
}
