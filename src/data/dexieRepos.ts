import { CIQUAL_VERSION, flagsToKeys, type CiqualFood } from '../ciqual/format';
import { nowIso } from '../domain/dates';
import { buildExport, type FullData } from '../domain/exportFormat';
import { planMerge, type LocalData } from '../domain/merge';
import { isExpired } from '../domain/drafts';
import { snapshotOf, type Food, type Recipe, type RecipeLine, type RecipeVersion, type Settings } from '../domain/types';
import { indicativeFields, unitDefaultsFor } from '../domain/unitDefaults';
import { DEFAULT_UNIT_STEP, hasUnitWeight } from '../domain/units';
import { defaultDensity, validateBlocks, validateFood, validateKcalTarget, validateLines } from '../domain/validation';
import { currentVersion, sameLines, sortVersions } from '../domain/versions';
import type { RepeatDB } from './db';
import { DataError, type LineInput, type Repos } from './repos';

const alive = <T extends { deleted_at?: string }>(x: T) => !x.deleted_at;

/** Champs optionnels d'un aliment : une valeur `undefined` supprime la clé (JSON stable). */
const OPTIONAL_FOOD_KEYS = ['density_g_ml', 'unit_weight_g', 'unit_label', 'unit_step', 'unit_indicative'] as const;

/**
 * Normalise un aliment avant écriture : retire les clés optionnelles vides et
 * synchronise `is_unit_item`, dérivé du poids unitaire depuis la v1.1.
 */
function normalizeFood(f: Food): Food {
  const out: Food = { ...f, is_unit_item: hasUnitWeight(f) };
  for (const k of OPTIONAL_FOOD_KEYS) if (out[k] === undefined) delete out[k];
  if (out.unit_label !== undefined) out.unit_label = out.unit_label.trim() || undefined;
  if (out.unit_label === undefined) delete out.unit_label;
  if (!out.unit_indicative) delete out.unit_indicative;
  // Pas par défaut (1) non stocké : une seule représentation, donc un instantané stable.
  if (out.unit_step === DEFAULT_UNIT_STEP) delete out.unit_step;
  return out;
}

function errorMessage(e: unknown): string {
  if (e instanceof DataError) return e.message;
  const name = e instanceof Error ? e.name : '';
  if (name === 'QuotaExceededError' || (e instanceof Error && /quota/i.test(e.message))) {
    return "l'espace de stockage de l'appareil est plein";
  }
  return e instanceof Error ? e.message : String(e);
}

export function createDexieRepos(db: RepeatDB, appVersion: string, newId: () => string = () => crypto.randomUUID()): Repos {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  /** Écriture transactionnelle : toute erreur devient un DataError lisible. */
  async function write<T>(label: string, tables: string[], fn: () => Promise<T>): Promise<T> {
    let result: T;
    try {
      result = await db.transaction('rw', tables, fn);
    } catch (e) {
      if (e instanceof DataError) throw e;
      throw new DataError(`Échec de l'enregistrement (${label}) : ${errorMessage(e)}.`);
    }
    notify();
    return result;
  }

  /** Écriture sans notification (brouillons : une écriture par frappe, personne n'écoute). */
  async function quiet<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw new DataError(`Échec de l'enregistrement (${label}) : ${errorMessage(e)}.`);
    }
  }

  function fail(msg: string | string[] | null): void {
    if (msg === null || (Array.isArray(msg) && msg.length === 0)) return;
    throw new DataError(Array.isArray(msg) ? msg.join(' ') : msg);
  }

  async function mustGet<T>(p: Promise<T | undefined>, what: string): Promise<T> {
    const x = await p;
    if (!x) throw new DataError(`${what} introuvable.`);
    return x;
  }

  async function buildLines(inputs: LineInput[]): Promise<RecipeLine[]> {
    const foods = await db.foods.bulkGet(inputs.map((l) => l.food_id));
    return inputs.map((l, i) => {
      const f = foods[i];
      if (!f || f.deleted_at) throw new DataError('Un aliment de la recette est introuvable.');
      return { food_id: f.id, food_snapshot: snapshotOf(f), quantity: l.quantity, unit: l.unit };
    });
  }

  async function versionsOf(recipeId: string): Promise<RecipeVersion[]> {
    return sortVersions(await db.recipeVersions.where('recipe_id').equals(recipeId).toArray());
  }

  async function insertVersion(recipeId: string, lines: RecipeLine[]): Promise<RecipeVersion> {
    fail(validateLines(lines));
    const versions = await versionsOf(recipeId);
    const cur = versions.at(-1);
    if (cur && sameLines(cur.lines, lines)) return cur;
    // created_at strictement croissant pour que la nouvelle version soit bien la courante.
    let created = nowIso();
    if (cur && created <= cur.created_at) created = new Date(new Date(cur.created_at).getTime() + 1).toISOString();
    const v: RecipeVersion = { id: newId(), recipe_id: recipeId, created_at: created, lines };
    await db.recipeVersions.add(v);
    const r = await db.recipes.get(recipeId);
    if (r) await db.recipes.put({ ...r, updated_at: nowIso() });
    return v;
  }

  async function localData(): Promise<LocalData> {
    const [foods, recipes, recipeVersions, phases, days, templates] = await Promise.all([
      db.foods.toArray(),
      db.recipes.toArray(),
      db.recipeVersions.toArray(),
      db.phases.toArray(),
      db.days.toArray(),
      db.templates.toArray(),
    ]);
    return { foods, recipes, recipeVersions, phases, days, templates };
  }

  const SETTINGS_DEFAULTS: Settings = { ciqual_version: CIQUAL_VERSION };

  const repos: Repos = {
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    foods: {
      async list(opts) {
        const all = (await db.foods.toArray()).filter(alive);
        return all
          .filter((f) => opts?.includeArchived || !f.archived)
          .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      },
      get: (id) => db.foods.get(id),
      async getMany(ids) {
        const list = await db.foods.bulkGet(ids);
        return new Map(ids.map((id, i) => [id, list[i]]));
      },
      async create(draft) {
        fail(validateFood(draft));
        const now = nowIso();
        const f = normalizeFood({
          ...draft,
          id: newId(),
          name: draft.name.trim(),
          source: 'custom',
          missing_flags: [],
          is_unit_item: false,
          archived: false,
          created_at: now,
          updated_at: now,
        });
        return write('aliment', ['foods'], async () => {
          await db.foods.add(f);
          return f;
        });
      },
      fromCiqual(c: CiqualFood) {
        return write('aliment', ['foods'], async () => {
          const existing = (await db.foods.where('ciqual_code').equals(c.code).toArray()).find(alive);
          if (existing) {
            if (existing.archived) {
              const u = { ...existing, archived: false, updated_at: nowIso() };
              await db.foods.put(u);
              return u;
            }
            return existing;
          }
          const now = nowIso();
          const f: Food = normalizeFood({
            // Valeurs d'unité indicatives (avocat = 140 g, pas ½…), signalées comme telles.
            ...indicativeFields(unitDefaultsFor({ name: c.name, ssgrp: c.ssgrp })),
            id: newId(),
            name: c.name,
            source: 'ciqual',
            ciqual_code: c.code,
            ciqual_version: CIQUAL_VERSION,
            kcal_100g: c.kcal,
            prot_100g: c.prot,
            carb_100g: c.carb,
            fat_100g: c.fat,
            missing_flags: flagsToKeys(c.flags),
            is_unit_item: false,
            archived: false,
            created_at: now,
            updated_at: now,
          });
          const d = defaultDensity(c.name);
          if (d !== undefined) f.density_g_ml = d;
          await db.foods.add(f);
          return f;
        });
      },
      update(id, patch) {
        return write('aliment', ['foods'], async () => {
          const cur = await mustGet(db.foods.get(id), 'Aliment');
          // Une clé présente à undefined dans le patch efface le champ (normalizeFood).
          const next = normalizeFood({ ...cur, ...patch, updated_at: nowIso() });
          if (patch.name !== undefined) next.name = patch.name.trim();
          fail(validateFood(next));
          await db.foods.put(next);
          return next;
        });
      },
      async outdatedRecipes(foodId) {
        const food = await db.foods.get(foodId);
        if (!food) return [];
        const snap = JSON.stringify(snapshotOf(food));
        const currents = await repos.recipes.currents();
        const ids = [...currents.values()]
          .filter((v) => v.lines.some((l) => l.food_id === foodId && JSON.stringify(l.food_snapshot) !== snap))
          .map((v) => v.recipe_id);
        const recipes = await db.recipes.bulkGet(ids);
        return recipes.filter((r): r is NonNullable<typeof r> => !!r && alive(r));
      },
    },

    recipes: {
      async list(opts) {
        const all = (await db.recipes.toArray()).filter(alive);
        return all
          .filter((r) => opts?.includeArchived || !r.archived)
          .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      },
      get: (id) => db.recipes.get(id),
      async create(meta, inputs) {
        const { recipe, version } = await repos.recipes.save({ ...meta, lines: inputs });
        return { recipe, version };
      },
      save(input) {
        if (!input.name.trim()) throw new DataError('Le nom de la recette est requis.');
        const name = input.name.trim();
        return write('recette', ['recipes', 'recipeVersions', 'foods', 'recipeDrafts'], async () => {
          const lines = await buildLines(input.lines);
          fail(validateLines(lines));
          let result: { recipe: Recipe; version: RecipeVersion; newVersion: boolean };
          if (input.recipeId === undefined) {
            const now = nowIso();
            const recipe: Recipe = { id: newId(), name, category: input.category, archived: false, created_at: now, updated_at: now };
            await db.recipes.add(recipe);
            const version: RecipeVersion = { id: newId(), recipe_id: recipe.id, created_at: now, lines };
            await db.recipeVersions.add(version);
            result = { recipe, version, newVersion: true };
          } else {
            const cur = await mustGet(db.recipes.get(input.recipeId), 'Recette');
            if (cur.name !== name || cur.category !== input.category) {
              await db.recipes.put({ ...cur, name, category: input.category, updated_at: nowIso() });
            }
            const before = (await versionsOf(cur.id)).at(-1);
            const version = await insertVersion(cur.id, lines);
            const recipe = await mustGet(db.recipes.get(cur.id), 'Recette');
            result = { recipe, version, newVersion: version.id !== before?.id };
          }
          if (input.draftId !== undefined) await db.recipeDrafts.delete(input.draftId);
          return result;
        });
      },
      updateMeta(id, patch) {
        return write('recette', ['recipes'], async () => {
          const cur = await mustGet(db.recipes.get(id), 'Recette');
          const next = { ...cur, ...patch, updated_at: nowIso() };
          if (!next.name.trim()) throw new DataError('Le nom de la recette est requis.');
          next.name = next.name.trim();
          await db.recipes.put(next);
          return next;
        });
      },
      addVersion(recipeId, inputs) {
        return write('version de recette', ['recipes', 'recipeVersions', 'foods'], async () => {
          await mustGet(db.recipes.get(recipeId), 'Recette');
          return insertVersion(recipeId, await buildLines(inputs));
        });
      },
      restoreVersion(versionId) {
        return write('version de recette', ['recipes', 'recipeVersions'], async () => {
          const old = await mustGet(db.recipeVersions.get(versionId), 'Version');
          return insertVersion(old.recipe_id, old.lines);
        });
      },
      versions: versionsOf,
      async current(recipeId) {
        return (await versionsOf(recipeId)).at(-1);
      },
      async currents() {
        const all = await db.recipeVersions.toArray();
        const byRecipe = new Map<string, RecipeVersion[]>();
        for (const v of all) {
          const l = byRecipe.get(v.recipe_id) ?? [];
          l.push(v);
          byRecipe.set(v.recipe_id, l);
        }
        const out = new Map<string, RecipeVersion>();
        for (const [id, list] of byRecipe) {
          const cur = currentVersion(list);
          if (cur) out.set(id, cur);
        }
        return out;
      },
      async getVersions(ids) {
        const list = await db.recipeVersions.bulkGet([...new Set(ids)]);
        return new Map(list.filter((v): v is RecipeVersion => !!v).map((v) => [v.id, v]));
      },
      refreshFood(recipeIds, foodId) {
        return write('versions de recettes', ['recipes', 'recipeVersions', 'foods'], async () => {
          const food = await mustGet(db.foods.get(foodId), 'Aliment');
          const snap = snapshotOf(food);
          let n = 0;
          for (const rid of recipeIds) {
            const cur = (await versionsOf(rid)).at(-1);
            if (!cur) continue;
            const lines = cur.lines.map((l) => (l.food_id === foodId ? { ...l, food_snapshot: snap } : l));
            const v = await insertVersion(rid, lines);
            if (v.id !== cur.id) n++;
          }
          return n;
        });
      },
    },

    drafts: {
      list: () => db.recipeDrafts.toArray(),
      get: (id) => db.recipeDrafts.get(id),
      async put(d) {
        await quiet('brouillon', () => db.recipeDrafts.put(d));
      },
      async remove(id) {
        await quiet('brouillon', () => db.recipeDrafts.delete(id));
      },
      purge() {
        return quiet('brouillons', async () => {
          const now = nowIso();
          const old = (await db.recipeDrafts.toArray()).filter((d) => isExpired(d, now)).map((d) => d.id);
          await db.recipeDrafts.bulkDelete(old);
          return old.length;
        });
      },
    },

    phases: {
      async list() {
        return (await db.phases.toArray()).filter(alive).sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
      },
      async create(p) {
        fail(validateKcalTarget(p.kcal_target));
        if (!p.name.trim()) throw new DataError('Le nom de la phase est requis.');
        const now = nowIso();
        const phase = { id: newId(), name: p.name.trim(), kcal_target: p.kcal_target, start_date: p.start_date, created_at: now, updated_at: now };
        return write('phase', ['phases'], async () => {
          await db.phases.add(phase);
          return phase;
        });
      },
      async update(id, patch) {
        if (patch.kcal_target !== undefined) fail(validateKcalTarget(patch.kcal_target));
        return write('phase', ['phases'], async () => {
          const cur = await mustGet(db.phases.get(id), 'Phase');
          const next = { ...cur, ...patch, updated_at: nowIso() };
          await db.phases.put(next);
          return next;
        });
      },
      remove(id) {
        return write('phase', ['phases'], async () => {
          const cur = await mustGet(db.phases.get(id), 'Phase');
          const now = nowIso();
          await db.phases.put({ ...cur, deleted_at: now, updated_at: now });
        });
      },
    },

    days: {
      async list() {
        return (await db.days.toArray()).filter(alive).sort((a, b) => (a.date < b.date ? 1 : -1));
      },
      async getByDate(date) {
        const list = (await db.days.where('date').equals(date).toArray()).filter(alive);
        return list.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];
      },
      async create(date, kcal_target, entries) {
        for (const e of entries) fail(validateBlocks(e.blocks));
        return write('journée', ['days'], async () => {
          const existing = (await db.days.where('date').equals(date).toArray()).find(alive);
          if (existing) throw new DataError('Une journée existe déjà à cette date.');
          const now = nowIso();
          const day = { id: newId(), date, status: 'draft' as const, kcal_target_snapshot: kcal_target, entries, created_at: now, updated_at: now };
          await db.days.add(day);
          return day;
        });
      },
      async update(id, patch) {
        for (const e of patch.entries ?? []) fail(validateBlocks(e.blocks));
        return write('journée', ['days'], async () => {
          const cur = await mustGet(db.days.get(id), 'Journée');
          const next = { ...cur, ...patch, updated_at: nowIso() };
          await db.days.put(next);
          return next;
        });
      },
      remove(id) {
        return write('journée', ['days'], async () => {
          const cur = await mustGet(db.days.get(id), 'Journée');
          const now = nowIso();
          await db.days.put({ ...cur, deleted_at: now, updated_at: now });
        });
      },
    },

    templates: {
      async list() {
        return (await db.templates.toArray()).filter(alive).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      },
      async create(name, entries) {
        if (!name.trim()) throw new DataError('Le nom du modèle est requis.');
        for (const e of entries) fail(validateBlocks(e.blocks));
        const now = nowIso();
        const t = { id: newId(), name: name.trim(), entries, created_at: now, updated_at: now };
        return write('modèle', ['templates'], async () => {
          await db.templates.add(t);
          return t;
        });
      },
      remove(id) {
        return write('modèle', ['templates'], async () => {
          const cur = await mustGet(db.templates.get(id), 'Modèle');
          const now = nowIso();
          await db.templates.put({ ...cur, deleted_at: now, updated_at: now });
        });
      },
    },

    settings: {
      async get() {
        const rows = await db.settings.toArray();
        const s: Record<string, unknown> = { ...SETTINGS_DEFAULTS };
        for (const r of rows) s[r.key] = r.value;
        return s as Settings;
      },
      set(patch) {
        return write('réglages', ['settings'], async () => {
          await db.settings.bulkPut(Object.entries(patch).map(([key, value]) => ({ key, value })));
        });
      },
    },

    backup: {
      async isEmpty() {
        const counts = await Promise.all([db.foods.count(), db.recipes.count(), db.phases.count(), db.days.count()]);
        return counts.every((c) => c === 0);
      },
      async exportData(type) {
        const local = await localData();
        const settings = await repos.settings.get();
        const data: FullData = { ...local, settings };
        return buildExport(type, data, appVersion, nowIso());
      },
      async preview(file) {
        return planMerge(await localData(), file, nowIso());
      },
      apply(file) {
        return write('import', ['foods', 'recipes', 'recipeVersions', 'phases', 'days', 'templates'], async () => {
          const plan = planMerge(await localData(), file, nowIso());
          const p = plan.puts;
          await db.foods.bulkPut(p.foods);
          await db.recipes.bulkPut(p.recipes);
          await db.recipeVersions.bulkAdd(p.recipeVersions);
          if (plan.export_type === 'full') {
            await db.phases.bulkPut(p.phases);
            await db.days.bulkPut(p.days);
            await db.templates.bulkPut(p.templates);
          }
          return plan;
        });
      },
    },
  };
  return repos;
}
