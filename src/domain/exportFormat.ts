import { isIsoDate } from './dates';
import type { Day, Food, Phase, Recipe, RecipeVersion, Settings, Template } from './types';
import { CATEGORIES } from './types';

export const SCHEMA_VERSION = 1;

export type CatalogData = {
  foods: Food[];
  recipes: Recipe[];
  recipeVersions: RecipeVersion[];
};

export type FullData = CatalogData & {
  phases: Phase[];
  days: Day[];
  templates: Template[];
  settings: Partial<Settings>;
};

export type ExportType = 'catalog' | 'full';

export type ExportFile =
  | { schema_version: number; export_type: 'catalog'; exported_at: string; app_version: string; data: CatalogData }
  | { schema_version: number; export_type: 'full'; exported_at: string; app_version: string; data: FullData };

export class ImportError extends Error {}

export function buildExport(
  type: ExportType,
  data: FullData,
  appVersion: string,
  exportedAt: string,
): ExportFile {
  const catalog: CatalogData = { foods: data.foods, recipes: data.recipes, recipeVersions: data.recipeVersions };
  const base = { schema_version: SCHEMA_VERSION, exported_at: exportedAt, app_version: appVersion };
  return type === 'catalog'
    ? { ...base, export_type: 'catalog', data: catalog }
    : { ...base, export_type: 'full', data };
}

export function exportFileName(type: ExportType, exportedAt: string): string {
  const stamp = exportedAt.slice(0, 16).replace(/[:T]/g, '-');
  return `repeat-${type === 'catalog' ? 'catalogue' : 'complet'}-${stamp}.json`;
}

/** Migration d'un fichier du schéma n vers n + 1. */
export type Migration = (file: Record<string, unknown>) => Record<string, unknown>;

/** Clé = version source. Vide tant que le schéma n'a pas changé. */
export const MIGRATIONS: Record<number, Migration> = {};

export function migrateExport(
  raw: Record<string, unknown>,
  target: number = SCHEMA_VERSION,
  migrations: Record<number, Migration> = MIGRATIONS,
): Record<string, unknown> {
  let v = raw.schema_version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new ImportError('Fichier invalide : schema_version manquant ou incorrect.');
  }
  if (v > target) {
    throw new ImportError(
      `Ce fichier vient d'une version plus récente de l'app (schéma ${v}, cette app gère le schéma ${target}). Mettez l'app à jour avant d'importer.`,
    );
  }
  let file = raw;
  while (v < target) {
    const m = migrations[v];
    if (!m) throw new ImportError(`Aucune migration disponible depuis le schéma ${v}.`);
    file = { ...m(file), schema_version: v + 1 };
    v += 1;
  }
  return file;
}

// ---------- Validation structurelle ----------

type Obj = Record<string, unknown>;

function isObj(x: unknown): x is Obj {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

class Checker {
  constructor(private path: string) {}
  err(msg: string): ImportError {
    return new ImportError(`Fichier invalide (${this.path}) : ${msg}`);
  }
  str(o: Obj, k: string, optional = false) {
    const v = o[k];
    if (v === undefined && optional) return;
    if (typeof v !== 'string' || (!optional && v === '')) throw this.err(`« ${k} » doit être un texte.`);
  }
  num(o: Obj, k: string, opts: { nullable?: boolean; optional?: boolean } = {}) {
    const v = o[k];
    if (v === undefined && opts.optional) return;
    if (v === null && opts.nullable) return;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw this.err(`« ${k} » doit être un nombre.`);
  }
  bool(o: Obj, k: string) {
    if (typeof o[k] !== 'boolean') throw this.err(`« ${k} » doit être un booléen.`);
  }
  oneOf(o: Obj, k: string, values: readonly string[]) {
    if (!values.includes(o[k] as string)) throw this.err(`« ${k} » doit valoir ${values.join(', ')}.`);
  }
  date(o: Obj, k: string) {
    if (typeof o[k] !== 'string' || !isIsoDate(o[k])) throw this.err(`« ${k} » doit être une date AAAA-MM-JJ.`);
  }
  timestamps(o: Obj) {
    this.str(o, 'created_at');
    this.str(o, 'updated_at');
    this.str(o, 'deleted_at', true);
  }
  arr(o: Obj, k: string): unknown[] {
    const v = o[k];
    if (!Array.isArray(v)) throw this.err(`« ${k} » doit être une liste.`);
    return v;
  }
}

function each(list: unknown[], name: string, check: (c: Checker, o: Obj) => void) {
  list.forEach((item, i) => {
    const c = new Checker(`${name}[${i}]`);
    if (!isObj(item)) throw c.err('élément invalide.');
    c.str(item, 'id');
    check(c, item);
  });
}

const MACRO_KEYS = ['kcal', 'prot', 'carb', 'fat'] as const;

function checkSnapshot(c: Checker, s: unknown) {
  if (!isObj(s)) throw c.err('food_snapshot invalide.');
  c.str(s, 'name');
  for (const k of ['kcal_100g', 'prot_100g', 'carb_100g', 'fat_100g']) c.num(s, k, { nullable: true });
  c.num(s, 'density_g_ml', { optional: true });
  c.num(s, 'unit_weight_g', { optional: true });
  c.bool(s, 'is_unit_item');
}

function checkCatalog(d: Obj) {
  const root = new Checker('data');
  each(root.arr(d, 'foods'), 'foods', (c, o) => {
    c.str(o, 'name');
    c.oneOf(o, 'source', ['ciqual', 'custom']);
    c.str(o, 'ciqual_code', true);
    c.str(o, 'ciqual_version', true);
    for (const k of ['kcal_100g', 'prot_100g', 'carb_100g', 'fat_100g']) c.num(o, k, { nullable: true });
    const flags = c.arr(o, 'missing_flags');
    if (!flags.every((f) => MACRO_KEYS.includes(f as (typeof MACRO_KEYS)[number]))) throw c.err('missing_flags invalide.');
    c.num(o, 'density_g_ml', { optional: true });
    c.num(o, 'unit_weight_g', { optional: true });
    c.bool(o, 'is_unit_item');
    c.bool(o, 'archived');
    c.timestamps(o);
  });
  each(root.arr(d, 'recipes'), 'recipes', (c, o) => {
    c.str(o, 'name');
    c.oneOf(o, 'category', CATEGORIES.map((x) => x.id));
    c.bool(o, 'archived');
    c.timestamps(o);
  });
  each(root.arr(d, 'recipeVersions'), 'recipeVersions', (c, o) => {
    c.str(o, 'recipe_id');
    c.str(o, 'created_at');
    for (const l of c.arr(o, 'lines')) {
      if (!isObj(l)) throw c.err('ligne invalide.');
      c.str(l, 'food_id');
      c.num(l, 'quantity');
      c.oneOf(l, 'unit', ['g', 'ml']);
      checkSnapshot(c, l.food_snapshot);
    }
  });
}

function checkPersonal(d: Obj) {
  const root = new Checker('data');
  each(root.arr(d, 'phases'), 'phases', (c, o) => {
    c.str(o, 'name');
    c.num(o, 'kcal_target');
    c.date(o, 'start_date');
    c.timestamps(o);
  });
  each(root.arr(d, 'days'), 'days', (c, o) => {
    c.date(o, 'date');
    c.oneOf(o, 'status', ['draft', 'validated']);
    c.num(o, 'kcal_target_snapshot');
    for (const e of c.arr(o, 'entries')) {
      if (!isObj(e)) throw c.err('entrée invalide.');
      c.str(e, 'recipe_version_id');
      c.num(e, 'blocks');
    }
    c.timestamps(o);
  });
  each(root.arr(d, 'templates'), 'templates', (c, o) => {
    c.str(o, 'name');
    for (const e of c.arr(o, 'entries')) {
      if (!isObj(e)) throw c.err('entrée invalide.');
      c.str(e, 'recipe_id');
      c.num(e, 'blocks');
    }
    c.timestamps(o);
  });
  if (d.settings !== undefined && !isObj(d.settings)) throw root.err('« settings » invalide.');
}

/** Lit, migre et valide un fichier d'export. Lève ImportError avec un message lisible. */
export function parseExport(text: string): ExportFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError("Ce fichier n'est pas un JSON valide.");
  }
  if (!isObj(raw)) throw new ImportError("Ce fichier n'est pas un export RepEAT.");
  const file = migrateExport(raw);
  const c = new Checker('racine');
  c.oneOf(file, 'export_type', ['catalog', 'full']);
  c.str(file, 'exported_at');
  c.str(file, 'app_version');
  if (!isObj(file.data)) throw c.err('« data » manquant.');
  checkCatalog(file.data);
  if (file.export_type === 'full') {
    checkPersonal(file.data);
    if (file.data.settings === undefined) file.data.settings = {};
  }
  return file as unknown as ExportFile;
}
