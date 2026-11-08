import { CIQUAL_FILE, fromRow, type CiqualFood, type CiqualRow } from './format';
import { buildIndex, search, type SearchIndex } from './search';

let loading: Promise<SearchIndex<CiqualFood>> | null = null;

/** Charge la table Ciqual prétraitée (précachée par le service worker). */
export function loadCiqual(): Promise<SearchIndex<CiqualFood>> {
  loading ??= fetch(`${import.meta.env.BASE_URL}${CIQUAL_FILE}`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<CiqualRow[]>;
    })
    .then((rows) => buildIndex(rows.map(fromRow)))
    .catch((e: unknown) => {
      loading = null;
      throw new Error(`Impossible de charger la table Ciqual : ${e instanceof Error ? e.message : String(e)}`);
    });
  return loading;
}

export async function searchCiqual(query: string, limit = 30): Promise<CiqualFood[]> {
  return search(await loadCiqual(), query, limit);
}
