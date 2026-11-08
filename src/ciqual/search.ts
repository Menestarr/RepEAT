import { normalize } from './format';

export type Searchable = { norm: string };

type Indexed<T> = { item: T; tokens: string[] };

export type SearchIndex<T> = { entries: Indexed<T>[] };

export function buildIndex<T extends Searchable>(items: T[]): SearchIndex<T> {
  return { entries: items.map((item) => ({ item, tokens: item.norm.split(' ').filter(Boolean) })) };
}

/**
 * Correspondance par tokens : chaque mot de la requête doit être le début d'un mot du nom.
 * Classement : nom commençant par le premier mot, mots exacts, puis noms courts.
 */
export function search<T>(index: SearchIndex<T>, query: string, limit = 50): T[] {
  const q = normalize(query).split(' ').filter(Boolean);
  if (q.length === 0) return [];
  const scored: { item: T; score: number; len: number; chars: number }[] = [];
  for (const e of index.entries) {
    let score = 0;
    let ok = true;
    for (const [qi, qt] of q.entries()) {
      const pos = e.tokens.findIndex((t) => t.startsWith(qt));
      if (pos >= 0) {
        score += 10;
        if (qi === 0 && pos === 0) score += 20;
        if (e.tokens[pos] === qt) score += 3;
        continue;
      }
      ok = false;
      break;
    }
    if (ok) scored.push({ item: e.item, score, len: e.tokens.length, chars: e.tokens.join(' ').length });
  }
  scored.sort((a, b) => b.score - a.score || a.len - b.len || a.chars - b.chars);
  return scored.slice(0, limit).map((s) => s.item);
}
