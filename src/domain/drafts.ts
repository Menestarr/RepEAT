/**
 * Règles des brouillons de recette (SPEC v1.1 §6), indépendantes du stockage.
 */
import { daysSince } from './dates';
import type { Food, RecipeDraft, Unit } from './types';
import { hasUnitWeight } from './units';

/** Délai après la dernière frappe avant l'enregistrement du brouillon. */
export const DRAFT_SAVE_DELAY_MS = 500;
/** Un brouillon plus ancien est purgé au démarrage. */
export const DRAFT_MAX_AGE_DAYS = 30;
export const UNTITLED = 'Sans nom';

export function isExpired(d: Pick<RecipeDraft, 'updated_at'>, now: string, maxAgeDays = DRAFT_MAX_AGE_DAYS): boolean {
  return daysSince(d.updated_at, new Date(now)) > maxAgeDays;
}

/**
 * Libellés des nouvelles recettes sans nom, numérotés comme un explorateur de
 * fichiers : « Sans nom », « Sans nom (1) », « Sans nom (2) »… dans l'ordre de création.
 * Les brouillons nommés ou de recettes existantes ne sont pas renvoyés.
 */
export function untitledLabels(drafts: Pick<RecipeDraft, 'id' | 'recipe_id' | 'name' | 'created_at'>[]): Map<string, string> {
  const untitled = drafts
    .filter((d) => !d.recipe_id && !d.name.trim())
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1));
  return new Map(untitled.map((d, i) => [d.id, i === 0 ? UNTITLED : `${UNTITLED} (${i})`]));
}

/** Nom affiché d'un brouillon de nouvelle recette. */
export function draftLabel(d: Pick<RecipeDraft, 'id' | 'name'>, untitled: Map<string, string>): string {
  return d.name.trim() || untitled.get(d.id) || UNTITLED;
}

export type RestoredLine = {
  food: Food;
  quantity: string;
  unit: Unit;
  /** La ligne était en `u` mais l'aliment n'a plus de poids unitaire : repassée en g. */
  unitReset: boolean;
};

export type RestoredDraft = {
  lines: RestoredLine[];
  /** Noms (ou ids, si l'aliment a disparu) des aliments supprimés, retirés du brouillon. */
  removed: string[];
};

/**
 * Relit les lignes d'un brouillon avec les aliments actuels : un aliment complété
 * entre-temps est à jour, un aliment supprimé est retiré, et une ligne en `u` dont
 * l'aliment a perdu son poids unitaire repasse en g (mieux vaut une valeur imprécise
 * que pas de valeur ; la quantité est gardée, l'utilisateur la corrige).
 */
export function restoreDraftLines(lines: RecipeDraft['lines'], foods: Map<string, Food | undefined>): RestoredDraft {
  const out: RestoredLine[] = [];
  const removed: string[] = [];
  for (const l of lines) {
    const food = foods.get(l.food_id);
    if (!food || food.deleted_at) {
      removed.push(food?.name ?? l.food_id);
      continue;
    }
    const unitReset = l.unit === 'u' && !hasUnitWeight(food);
    out.push({ food, quantity: l.quantity, unit: unitReset ? 'g' : l.unit, unitReset });
  }
  return { lines: out, removed };
}
