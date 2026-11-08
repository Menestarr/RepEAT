import { CIQUAL_FILE, fromRow, type CiqualFood, type CiqualRow } from './format';
import { buildIndex, search, type SearchIndex } from './search';

type Loaded = { index: SearchIndex<CiqualFood>; byCode: Map<string, CiqualFood> };

let loading: Promise<Loaded> | null = null;

/** Charge la table Ciqual prétraitée (précachée par le service worker). */
function loadCiqual(): Promise<Loaded> {
  loading ??= fetch(`${import.meta.env.BASE_URL}${CIQUAL_FILE}`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<CiqualRow[]>;
    })
    .then((rows) => {
      const foods = rows.map(fromRow);
      return { index: buildIndex(foods), byCode: new Map(foods.map((f) => [f.code, f])) };
    })
    .catch((e: unknown) => {
      loading = null;
      throw new Error(`Impossible de charger la table Ciqual : ${e instanceof Error ? e.message : String(e)}`);
    });
  return loading;
}

export async function searchCiqual(query: string, limit = 30): Promise<CiqualFood[]> {
  return search((await loadCiqual()).index, query, limit);
}

/** Aliment de la table embarquée par son code (ex. relire le sous-groupe d'un aliment copié en v1). */
export async function ciqualByCode(code: string): Promise<CiqualFood | undefined> {
  return (await loadCiqual()).byCode.get(code);
}
