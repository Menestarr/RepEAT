import type { CatalogData, ExportFile, FullData } from './exportFormat';
import type { Day, RecipeVersion, Timestamps } from './types';

export type MergeableTable = 'foods' | 'recipes' | 'phases' | 'days' | 'templates';

export type TableStats = {
  added: number;
  updated: number;
  unchanged: number;
  /** Élément présent des deux côtés avec un contenu différent, résolu par last-write-wins. */
  conflicts: number;
};

export type MergePlan = {
  export_type: ExportFile['export_type'];
  puts: {
    foods: FullData['foods'];
    recipes: FullData['recipes'];
    recipeVersions: RecipeVersion[];
    phases: FullData['phases'];
    days: FullData['days'];
    templates: FullData['templates'];
  };
  stats: Record<MergeableTable, TableStats>;
  newVersions: number;
  /** Journées en double sur une même date, résolues en gardant la plus récente. */
  dayDateConflicts: number;
};

export type LocalData = CatalogData & Pick<FullData, 'phases' | 'days' | 'templates'>;

/** Sérialisation canonique (clés triées) pour comparer deux entités. */
export function canonical(x: unknown): string {
  return JSON.stringify(x, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

function emptyStats(): TableStats {
  return { added: 0, updated: 0, unchanged: 0, conflicts: 0 };
}

/**
 * Last-write-wins par id sur updated_at, tombstones compris.
 * À updated_at égal et contenu différent, la sérialisation canonique la plus grande gagne :
 * le résultat est le même quel que soit le sens de l'import.
 */
function mergeLww<T extends { id: string } & Timestamps>(local: T[], incoming: T[], stats: TableStats): T[] {
  const byId = new Map(local.map((x) => [x.id, x]));
  const puts: T[] = [];
  for (const inc of incoming) {
    const loc = byId.get(inc.id);
    if (!loc) {
      stats.added++;
      puts.push(inc);
      byId.set(inc.id, inc);
      continue;
    }
    const a = canonical(loc);
    const b = canonical(inc);
    if (a === b) {
      stats.unchanged++;
      continue;
    }
    stats.conflicts++;
    const incomingWins = inc.updated_at > loc.updated_at || (inc.updated_at === loc.updated_at && b > a);
    if (incomingWins) {
      stats.updated++;
      puts.push(inc);
      byId.set(inc.id, inc);
    }
  }
  return puts;
}

/**
 * Une seule journée non supprimée par date : en cas de doublon (deux appareils ont créé la même date),
 * la plus récente (updated_at, puis id) est conservée, les autres reçoivent un tombstone.
 */
function resolveDayDates(local: Day[], puts: Day[], now: string): { extra: Day[]; conflicts: number } {
  const final = new Map(local.map((d) => [d.id, d]));
  for (const d of puts) final.set(d.id, d);
  const byDate = new Map<string, Day[]>();
  for (const d of final.values()) {
    if (d.deleted_at) continue;
    const list = byDate.get(d.date) ?? [];
    list.push(d);
    byDate.set(d.date, list);
  }
  const extra: Day[] = [];
  let conflicts = 0;
  for (const list of byDate.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => (a.updated_at !== b.updated_at ? (a.updated_at < b.updated_at ? 1 : -1) : a.id < b.id ? 1 : -1));
    for (const loser of list.slice(1)) {
      conflicts++;
      extra.push({ ...loser, deleted_at: now, updated_at: now });
    }
  }
  return { extra, conflicts };
}

export function planMerge(local: LocalData, file: ExportFile, now: string): MergePlan {
  const stats: Record<MergeableTable, TableStats> = {
    foods: emptyStats(),
    recipes: emptyStats(),
    phases: emptyStats(),
    days: emptyStats(),
    templates: emptyStats(),
  };
  const d = file.data;

  const knownVersions = new Set(local.recipeVersions.map((v) => v.id));
  const recipeVersions: RecipeVersion[] = [];
  for (const v of d.recipeVersions) {
    if (knownVersions.has(v.id)) continue; // union par id, jamais d'écrasement
    knownVersions.add(v.id);
    recipeVersions.push(v);
  }

  const plan: MergePlan = {
    export_type: file.export_type,
    puts: {
      foods: mergeLww(local.foods, d.foods, stats.foods),
      recipes: mergeLww(local.recipes, d.recipes, stats.recipes),
      recipeVersions,
      phases: [],
      days: [],
      templates: [],
    },
    stats,
    newVersions: recipeVersions.length,
    dayDateConflicts: 0,
  };

  // Un export catalogue ne touche jamais aux données personnelles.
  if (file.export_type === 'full') {
    plan.puts.phases = mergeLww(local.phases, file.data.phases, stats.phases);
    const days = mergeLww(local.days, file.data.days, stats.days);
    const { extra, conflicts } = resolveDayDates(local.days, days, now);
    const merged = new Map(days.map((x) => [x.id, x]));
    for (const x of extra) merged.set(x.id, x);
    plan.puts.days = [...merged.values()];
    plan.dayDateConflicts = conflicts;
    plan.puts.templates = mergeLww(local.templates, file.data.templates, stats.templates);
  }
  return plan;
}

export function planIsEmpty(p: MergePlan): boolean {
  return Object.values(p.puts).every((l) => l.length === 0);
}

export function planTotals(p: MergePlan): { added: number; updated: number; conflicts: number; newVersions: number } {
  const s = Object.values(p.stats);
  return {
    added: s.reduce((n, x) => n + x.added, 0),
    updated: s.reduce((n, x) => n + x.updated, 0),
    conflicts: s.reduce((n, x) => n + x.conflicts, 0) + p.dayDateConflicts,
    newVersions: p.newVersions,
  };
}
