import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RepeatDB } from '../src/data/db';
import { createDexieRepos } from '../src/data/dexieRepos';
import { DataError, type Repos } from '../src/data/repos';
import { parseExport } from '../src/domain/exportFormat';
import { sortVersions } from '../src/domain/versions';

let db: RepeatDB;
let repos: Repos;
let n = 0;

beforeEach(async () => {
  db = new RepeatDB(`test-${++n}`);
  repos = createDexieRepos(db, 'test');
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

const RIZ = { name: 'Riz', kcal_100g: 350, prot_100g: 7, carb_100g: 78, fat_100g: 1 };

async function setup() {
  const riz = await repos.foods.create(RIZ);
  const { recipe, version } = await repos.recipes.create({ name: 'Bol', category: 'plat' }, [
    { food_id: riz.id, quantity: 200, unit: 'g' },
  ]);
  return { riz, recipe, version };
}

describe('schéma Dexie', () => {
  it('ouvre la version 2 avec les tables attendues', () => {
    expect(db.verno).toBe(2);
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['days', 'foods', 'phases', 'recipeDrafts', 'recipeVersions', 'recipes', 'settings', 'templates'].sort(),
    );
  });
});

describe('aliments', () => {
  it('Ciqual copié à la première utilisation, une seule fois', async () => {
    const c = { code: '17270', name: "Huile d'olive vierge extra", norm: '', kcal: 899, prot: 0.25, carb: null, fat: 99.9, flags: 4, ssgrp: '0902' };
    const a = await repos.foods.fromCiqual(c);
    const b = await repos.foods.fromCiqual({ ...c, kcal: 1 });
    expect(b.id).toBe(a.id);
    expect(b.kcal_100g).toBe(899);
    expect(a.density_g_ml).toBe(0.92);
    expect(a.missing_flags).toEqual(['carb']);
    expect(a.ciqual_version).toBe('2025');
  });
  it('sans kcal : inutilisable en recette', async () => {
    const f = await repos.foods.create({ ...RIZ, kcal_100g: null });
    await expect(repos.recipes.create({ name: 'X', category: 'plat' }, [{ food_id: f.id, quantity: 10, unit: 'g' }])).rejects.toThrow(
      DataError,
    );
  });
  it('validation : erreur explicite, rien d\'écrit', async () => {
    await expect(repos.foods.create({ ...RIZ, name: '' })).rejects.toThrow(DataError);
    expect(await db.foods.count()).toBe(0);
  });
});

describe('recettes versionnées', () => {
  it('modifier un aliment ne change aucune version existante', async () => {
    const { riz, recipe, version } = await setup();
    await repos.foods.update(riz.id, { kcal_100g: 360 });
    const v = await repos.recipes.current(recipe.id);
    expect(v?.id).toBe(version.id);
    expect(v?.lines[0]?.food_snapshot.kcal_100g).toBe(350);
    const outdated = await repos.foods.outdatedRecipes(riz.id);
    expect(outdated.map((r) => r.id)).toEqual([recipe.id]);
  });
  it('refreshFood crée les nouvelles versions', async () => {
    const { riz, recipe, version } = await setup();
    await repos.foods.update(riz.id, { kcal_100g: 360 });
    expect(await repos.recipes.refreshFood([recipe.id], riz.id)).toBe(1);
    const versions = await repos.recipes.versions(recipe.id);
    expect(versions).toHaveLength(2);
    expect(versions[0]?.id).toBe(version.id);
    expect(versions[1]?.lines[0]?.food_snapshot.kcal_100g).toBe(360);
    expect(await repos.foods.outdatedRecipes(riz.id)).toEqual([]);
  });
  it('nouvelle version seulement si les lignes changent', async () => {
    const { riz, recipe, version } = await setup();
    const same = await repos.recipes.addVersion(recipe.id, [{ food_id: riz.id, quantity: 200, unit: 'g' }]);
    expect(same.id).toBe(version.id);
    const next = await repos.recipes.addVersion(recipe.id, [{ food_id: riz.id, quantity: 250, unit: 'g' }]);
    expect(next.id).not.toBe(version.id);
    expect((await repos.recipes.current(recipe.id))?.id).toBe(next.id);
  });
  it('restaurer = nouvelle version identique à l\'ancienne', async () => {
    const { riz, recipe, version } = await setup();
    await repos.recipes.addVersion(recipe.id, [{ food_id: riz.id, quantity: 250, unit: 'g' }]);
    const restored = await repos.recipes.restoreVersion(version.id);
    const all = await repos.recipes.versions(recipe.id);
    expect(all).toHaveLength(3);
    expect(all.at(-1)?.id).toBe(restored.id);
    expect(restored.lines).toEqual(version.lines);
  });
});

describe('journées', () => {
  it('une seule journée par date', async () => {
    await repos.days.create('2026-11-08', 1900, []);
    await expect(repos.days.create('2026-11-08', 1900, [])).rejects.toThrow(/existe déjà/);
  });
  it('blocs invalides refusés', async () => {
    const { version } = await setup();
    const d = await repos.days.create('2026-11-08', 1900, []);
    await expect(repos.days.update(d.id, { entries: [{ recipe_version_id: version.id, blocks: 0.3 }] })).rejects.toThrow(DataError);
  });
  it('suppression = tombstone', async () => {
    const d = await repos.days.create('2026-11-08', 1900, []);
    await repos.days.remove(d.id);
    expect(await repos.days.getByDate('2026-11-08')).toBeUndefined();
    expect((await db.days.get(d.id))?.deleted_at).toBeTruthy();
  });
});

describe('export / import', () => {
  it('export complet → import dans une base vide', async () => {
    await setup();
    await repos.phases.create({ name: 'Sèche', kcal_target: 1900, start_date: '2026-11-01' });
    const file = parseExport(JSON.stringify(await repos.backup.exportData('full')));

    const db2 = new RepeatDB(`test-${++n}`);
    const repos2 = createDexieRepos(db2, 'test');
    expect(await repos2.backup.isEmpty()).toBe(true);
    const preview = await repos2.backup.preview(file);
    expect(preview.stats.foods.added).toBe(1);
    expect(preview.newVersions).toBe(1);
    expect(await db2.foods.count()).toBe(0); // l'aperçu n'écrit rien
    await repos2.backup.apply(file);
    expect(await db2.foods.count()).toBe(1);
    expect(await db2.phases.count()).toBe(1);
    expect(await repos2.backup.isEmpty()).toBe(false);
    await db2.delete();
  });

  it('export catalogue : aucune donnée personnelle', async () => {
    await setup();
    await repos.phases.create({ name: 'Sèche', kcal_target: 1900, start_date: '2026-11-01' });
    const file = await repos.backup.exportData('catalog');
    expect(Object.keys(file.data).sort()).toEqual(['foods', 'recipeVersions', 'recipes']);
  });

  it('versions concurrentes de deux appareils fusionnées, la plus récente devient la courante', async () => {
    const { riz, recipe } = await setup();
    const snapshot = parseExport(JSON.stringify(await repos.backup.exportData('catalog')));

    const db2 = new RepeatDB(`test-${++n}`);
    const repos2 = createDexieRepos(db2, 'test');
    await repos2.backup.apply(snapshot);

    // Appareil 1 puis appareil 2 modifient la recette hors ligne.
    await repos.recipes.addVersion(recipe.id, [{ food_id: riz.id, quantity: 210, unit: 'g' }]);
    await new Promise((r) => setTimeout(r, 5));
    const v2 = await repos2.recipes.addVersion(recipe.id, [{ food_id: riz.id, quantity: 220, unit: 'g' }]);

    await repos.backup.apply(parseExport(JSON.stringify(await repos2.backup.exportData('catalog'))));
    const versions = sortVersions(await repos.recipes.versions(recipe.id));
    expect(versions).toHaveLength(3);
    expect((await repos.recipes.current(recipe.id))?.id).toBe(v2.id);
    await db2.delete();
  });

  it('import complet ne touche pas aux réglages locaux', async () => {
    await repos.settings.set({ last_full_export_at: '2026-01-01T00:00:00.000Z' });
    const other = createDexieRepos(new RepeatDB(`test-${++n}`), 'test');
    await other.settings.set({ last_full_export_at: '2030-01-01T00:00:00.000Z' });
    await repos.backup.apply(parseExport(JSON.stringify(await other.backup.exportData('full'))));
    expect((await repos.settings.get()).last_full_export_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('archivage propagé par import', async () => {
    const { recipe } = await setup();
    const db2 = new RepeatDB(`test-${++n}`);
    const repos2 = createDexieRepos(db2, 'test');
    await repos2.backup.apply(parseExport(JSON.stringify(await repos.backup.exportData('catalog'))));
    await new Promise((r) => setTimeout(r, 5));
    await repos.recipes.updateMeta(recipe.id, { archived: true });
    await repos2.backup.apply(parseExport(JSON.stringify(await repos.backup.exportData('catalog'))));
    expect((await repos2.recipes.list()).map((r) => r.id)).toEqual([]);
    await db2.delete();
  });

  it('notifie les écouteurs après écriture', async () => {
    let calls = 0;
    const off = repos.onChange(() => calls++);
    await repos.foods.create(RIZ);
    off();
    await repos.foods.create(RIZ);
    expect(calls).toBe(1);
  });
});
