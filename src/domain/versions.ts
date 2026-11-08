import type { Phase, RecipeVersion } from './types';

type Ordered = Pick<RecipeVersion, 'created_at' | 'id'>;

function compareVersions(a: Ordered, b: Ordered): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Tri chronologique : created_at, puis id. Le numéro de version en est dérivé. */
export function sortVersions<T extends Ordered>(versions: T[]): T[] {
  return [...versions].sort(compareVersions);
}

export function currentVersion<T extends Ordered>(versions: T[]): T | undefined {
  return sortVersions(versions).at(-1);
}

/** Numéro d'affichage (à partir de 1) d'une version parmi celles de sa recette, 0 si absente. */
export function versionNumber(versions: Ordered[], id: string): number {
  return sortVersions(versions).findIndex((v) => v.id === id) + 1;
}

export function sameLines(a: RecipeVersion['lines'], b: RecipeVersion['lines']): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Phase active à une date : la plus récente dont start_date <= date. */
export function activePhase(phases: Phase[], date: string): Phase | undefined {
  let best: Phase | undefined;
  for (const p of phases) {
    if (p.deleted_at || p.start_date > date) continue;
    if (
      !best ||
      p.start_date > best.start_date ||
      (p.start_date === best.start_date && p.updated_at > best.updated_at)
    ) {
      best = p;
    }
  }
  return best;
}
