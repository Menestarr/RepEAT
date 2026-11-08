/** Données v1.1 : migration Dexie, brouillons, unités, schéma d'export 2. */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RepeatDB } from '../src/data/db';
import { createDexieRepos } from '../src/data/dexieRepos';
import { DataError, type Repos } from '../src/data/repos';
import { ImportError, parseExport, SCHEMA_VERSION } from '../src/domain/exportFormat';
import type { RecipeDraft } from '../src/domain/types';
import { food, recipe, T0, version, line } from './helpers';

let db: RepeatDB;
let repos: Repos;
let n = 0;
const name = () => `v11-${n}`;

beforeEach(async () => {
  n++;
  db = new RepeatDB(name());
  repos = createDexieRepos(db, 'test');
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

const RIZ = { name: 'Riz', kcal_100g: 350, prot_100g: 7, carb_100g: 78, fat_100g: 1 };
const BANANE = { code: '13005', name: 'Banane, chair sans peau, crue', norm: '', kcal: 87.6, prot: 1, carb: 19.7, fat: null, flags: 8, ssgrp: '0204' };

function draft(p: Partial<RecipeDraft> = {}): RecipeDraft {
  return { id: 'd1', name: '', category: 'plat', lines: [], created_at: T0, updated_at: new Date().toISOString(), ...p };
}

describe('migration Dexie version(2)', () => {
  it('une base v1 peuplée s\'ouvre en v2, données intactes, table des brouillons vide', async () => {
    db.close();
    await Dexie.delete(name());
    const legacyName = `${name()}-legacy`;
    const v1 = new Dexie(legacyName);
    v1.version(1).stores({
      foods: 'id, name, ciqual_code',
      recipes: 'id, name, category',
      recipeVersions: 'id, recipe_id, created_at',
      phases: 'id, start_date',
      days: 'id, date',
      templates: 'id',
      settings: 'key',
    });
    await v1.table('foods').add(food({ id: 'f1', is_unit_item: true, unit_weight_g: 50 }));
    await v1.table('recipes').add(recipe());
    await v1.table('recipeVersions').add(version([line({ food_id: 'f1' })]));
    v1.close();

    const migrated = new RepeatDB(legacyName);
    await migrated.open();
    expect(migrated.verno).toBe(2);
    expect(await migrated.foods.get('f1')).toMatchObject({ unit_weight_g: 50, is_unit_item: true });
    expect(await migrated.recipeVersions.count()).toBe(1);
    expect(await migrated.recipeDrafts.count()).toBe(0);
    await migrated.delete();
  });
});

describe('aliments : champs d\'unité', () => {
  it('is_unit_item synchronisé avec le poids unitaire, pas 1 non stocké', async () => {
    const f = await repos.foods.create({ ...RIZ, unit_weight_g: 50, unit_step: 1 });
    expect(f.is_unit_item).toBe(true);
    expect(f.unit_step).toBeUndefined();
    const g = await repos.foods.update(f.id, { unit_weight_g: undefined });
    expect(g.is_unit_item).toBe(false);
    expect('unit_weight_g' in g).toBe(false);
  });
  it('copie Ciqual d\'un fruit : valeurs indicatives', async () => {
    const f = await repos.foods.fromCiqual(BANANE);
    expect(f).toMatchObject({ unit_weight_g: 120, unit_step: 0.5, unit_label: 'banane', unit_indicative: true, is_unit_item: true });
  });
  it('copie Ciqual hors liste : aucune valeur d\'unité', async () => {
    const f = await repos.foods.fromCiqual({ ...BANANE, code: '1', name: 'Riz blanc, cru', ssgrp: '0302' });
    expect(f.unit_weight_g).toBeUndefined();
    expect(f.unit_indicative).toBeUndefined();
  });
  it('ligne en u refusée sans poids unitaire', async () => {
    const riz = await repos.foods.create(RIZ);
    await expect(repos.recipes.create({ name: 'X', category: 'plat' }, [{ food_id: riz.id, quantity: 1, unit: 'u' }])).rejects.toThrow(DataError);
  });
});

describe('brouillons', () => {
  it('enregistrer la recette supprime le brouillon dans la même transaction', async () => {
    const riz = await repos.foods.create(RIZ);
    await repos.drafts.put(draft({ id: 'new-1', name: 'Bol' }));
    const res = await repos.recipes.save({ name: 'Bol', category: 'plat', lines: [{ food_id: riz.id, quantity: 100, unit: 'g' }], draftId: 'new-1' });
    expect(res.newVersion).toBe(true);
    expect(await repos.drafts.get('new-1')).toBeUndefined();
  });
  it('échec d\'enregistrement : le brouillon est conservé', async () => {
    const riz = await repos.foods.create({ ...RIZ, kcal_100g: null });
    await repos.drafts.put(draft({ id: 'new-2' }));
    await expect(
      repos.recipes.save({ name: 'Bol', category: 'plat', lines: [{ food_id: riz.id, quantity: 100, unit: 'g' }], draftId: 'new-2' }),
    ).rejects.toThrow(DataError);
    expect(await repos.drafts.get('new-2')).toBeDefined();
  });
  it('save d\'une recette existante : méta et version dans la même écriture', async () => {
    const riz = await repos.foods.create(RIZ);
    const { recipe: r, version: v } = await repos.recipes.create({ name: 'Bol', category: 'plat' }, [{ food_id: riz.id, quantity: 100, unit: 'g' }]);
    await repos.drafts.put(draft({ id: r.id, recipe_id: r.id, base_version_id: v.id }));
    const same = await repos.recipes.save({ recipeId: r.id, name: 'Bol 2', category: 'plat', lines: [{ food_id: riz.id, quantity: 100, unit: 'g' }], draftId: r.id });
    expect(same.newVersion).toBe(false);
    expect(same.recipe.name).toBe('Bol 2');
    const next = await repos.recipes.save({ recipeId: r.id, name: 'Bol 2', category: 'plat', lines: [{ food_id: riz.id, quantity: 150, unit: 'g' }] });
    expect(next.newVersion).toBe(true);
    expect(await repos.drafts.get(r.id)).toBeUndefined();
  });
  it('les écritures de brouillon ne notifient pas les écrans', async () => {
    let calls = 0;
    repos.onChange(() => calls++);
    await repos.drafts.put(draft());
    await repos.drafts.remove('d1');
    expect(calls).toBe(0);
  });
  it('purge des brouillons de plus de 30 jours', async () => {
    await repos.drafts.put(draft({ id: 'old', updated_at: '2020-01-01T00:00:00.000Z' }));
    await repos.drafts.put(draft({ id: 'recent' }));
    expect(await repos.drafts.purge()).toBe(1);
    expect((await repos.drafts.list()).map((d) => d.id)).toEqual(['recent']);
  });
  it('absents de l\'export complet, base avec seulement un brouillon = vide', async () => {
    await repos.drafts.put(draft());
    const file = await repos.backup.exportData('full');
    expect(JSON.stringify(file)).not.toContain('recipeDrafts');
    expect(await repos.backup.isEmpty()).toBe(true);
  });
});

describe('export schéma 2', () => {
  it('export au schéma 2, unités ménagères relues', async () => {
    const f = await repos.foods.fromCiqual(BANANE);
    await repos.recipes.create({ name: 'Smoothie', category: 'gouter' }, [{ food_id: f.id, quantity: 1.5, unit: 'u' }]);
    const file = await repos.backup.exportData('catalog');
    expect(file.schema_version).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(2);
    const back = parseExport(JSON.stringify(file));
    expect(back.data.recipeVersions[0]!.lines[0]!.unit).toBe('u');
  });
  it('fichier v1 importé dans l\'app v1.1 (migration 1 → 2 sans transformation)', async () => {
    const riz = await repos.foods.create(RIZ);
    await repos.recipes.create({ name: 'Bol', category: 'plat' }, [{ food_id: riz.id, quantity: 100, unit: 'g' }]);
    const file = { ...(await repos.backup.exportData('catalog')), schema_version: 1 };
    const parsed = parseExport(JSON.stringify(file));
    expect(parsed.schema_version).toBe(2);
    expect(parsed.data.foods).toHaveLength(1);
  });
  it('ligne en u sans poids unitaire refusée à l\'import', async () => {
    const riz = await repos.foods.create(RIZ);
    await repos.recipes.create({ name: 'Bol', category: 'plat' }, [{ food_id: riz.id, quantity: 100, unit: 'g' }]);
    const file = await repos.backup.exportData('catalog');
    file.data.recipeVersions[0]!.lines[0]!.unit = 'u';
    expect(() => parseExport(JSON.stringify(file))).toThrow(ImportError);
  });
});
