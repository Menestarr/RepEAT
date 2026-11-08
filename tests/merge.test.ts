import { describe, expect, it } from 'vitest';
import {
  buildExport,
  ImportError,
  migrateExport,
  parseExport,
  SCHEMA_VERSION,
  type ExportFile,
  type FullData,
} from '../src/domain/exportFormat';
import { canonical, planMerge, planTotals, type LocalData } from '../src/domain/merge';
import { day, food, line, phase, recipe, T0, T1, T2, template, version } from './helpers';

const NOW = '2026-11-08T12:00:00.000Z';

function local(p: Partial<LocalData> = {}): LocalData {
  return { foods: [], recipes: [], recipeVersions: [], phases: [], days: [], templates: [], ...p };
}

function full(p: Partial<FullData> = {}): ExportFile {
  return buildExport('full', { ...local(), settings: {}, ...p }, '0.1.0', NOW);
}

describe('fusion last-write-wins', () => {
  it('ajoute les éléments inconnus', () => {
    const plan = planMerge(local(), full({ foods: [food()] }), NOW);
    expect(plan.puts.foods).toHaveLength(1);
    expect(plan.stats.foods.added).toBe(1);
  });
  it('identique : inchangé', () => {
    const plan = planMerge(local({ foods: [food()] }), full({ foods: [food()] }), NOW);
    expect(plan.puts.foods).toHaveLength(0);
    expect(plan.stats.foods.unchanged).toBe(1);
  });
  it('le plus grand updated_at gagne (entrant plus récent)', () => {
    const plan = planMerge(
      local({ foods: [food({ name: 'A', updated_at: T0 })] }),
      full({ foods: [food({ name: 'B', updated_at: T1 })] }),
      NOW,
    );
    expect(plan.puts.foods[0]?.name).toBe('B');
    expect(plan.stats.foods).toMatchObject({ updated: 1, conflicts: 1 });
  });
  it('le plus grand updated_at gagne (local plus récent)', () => {
    const plan = planMerge(
      local({ foods: [food({ name: 'A', updated_at: T2 })] }),
      full({ foods: [food({ name: 'B', updated_at: T1 })] }),
      NOW,
    );
    expect(plan.puts.foods).toHaveLength(0);
    expect(plan.stats.foods.conflicts).toBe(1);
  });
  it('tombstone plus récent : supprime', () => {
    const plan = planMerge(
      local({ recipes: [recipe({ updated_at: T0 })] }),
      full({ recipes: [recipe({ updated_at: T1, deleted_at: T1 })] }),
      NOW,
    );
    expect(plan.puts.recipes[0]?.deleted_at).toBe(T1);
  });
  it('tombstone local plus récent : l\'élément ne réapparaît pas', () => {
    const plan = planMerge(
      local({ recipes: [recipe({ updated_at: T2, deleted_at: T2 })] }),
      full({ recipes: [recipe({ updated_at: T1 })] }),
      NOW,
    );
    expect(plan.puts.recipes).toHaveLength(0);
  });
  it('égalité de updated_at : résultat identique dans les deux sens', () => {
    const a = food({ name: 'A', updated_at: T1 });
    const b = food({ name: 'B', updated_at: T1 });
    const ab = planMerge(local({ foods: [a] }), full({ foods: [b] }), NOW);
    const ba = planMerge(local({ foods: [b] }), full({ foods: [a] }), NOW);
    const winnerAB = ab.puts.foods[0] ?? a;
    const winnerBA = ba.puts.foods[0] ?? b;
    expect(winnerAB.name).toBe(winnerBA.name);
  });
  it('comparaison insensible à l\'ordre des clés', () => {
    expect(canonical({ a: 1, b: { d: 1, c: 2 } })).toBe(canonical({ b: { c: 2, d: 1 }, a: 1 }));
  });
});

describe('fusion des versions de recettes', () => {
  it('union par id, jamais d\'écrasement', () => {
    const v1 = version([line()], { id: 'v1' });
    const v1bis = version([line({ quantity: 999 })], { id: 'v1' });
    const v2 = version([line()], { id: 'v2', created_at: T1 });
    const plan = planMerge(local({ recipeVersions: [v1] }), full({ recipeVersions: [v1bis, v2] }), NOW);
    expect(plan.puts.recipeVersions.map((v) => v.id)).toEqual(['v2']);
    expect(plan.newVersions).toBe(1);
  });
  it('versions concurrentes créées hors ligne : les deux sont conservées', () => {
    const base = version([line()], { id: 'v1', created_at: T0 });
    const deviceA = version([line({ quantity: 120 })], { id: 'vA', created_at: T1 });
    const deviceB = version([line({ quantity: 130 })], { id: 'vB', created_at: T2 });
    const plan = planMerge(local({ recipeVersions: [base, deviceA] }), full({ recipeVersions: [base, deviceB] }), NOW);
    expect(plan.puts.recipeVersions.map((v) => v.id)).toEqual(['vB']);
  });
});

describe('fusion des données personnelles', () => {
  it('export catalogue : phases, journées, modèles ignorés', () => {
    const data: FullData = { ...local({ phases: [phase()], days: [day()], templates: [template()] }), settings: {} };
    const catalog = buildExport('catalog', data, '0.1.0', NOW);
    expect('phases' in catalog.data).toBe(false);
    const plan = planMerge(local(), { ...catalog, data: { ...catalog.data, ...{ phases: [phase()] } } } as ExportFile, NOW);
    expect(plan.puts.phases).toHaveLength(0);
    expect(plan.puts.days).toHaveLength(0);
  });
  it('export complet : phases, journées, modèles fusionnés', () => {
    const plan = planMerge(local(), full({ phases: [phase()], days: [day()], templates: [template()] }), NOW);
    expect(plan.puts.phases).toHaveLength(1);
    expect(plan.puts.days).toHaveLength(1);
    expect(plan.puts.templates).toHaveLength(1);
  });
  it('deux journées à la même date : la plus récente reste, l\'autre reçoit un tombstone', () => {
    const mine = day({ id: 'dA', date: '2026-11-05', updated_at: T1 });
    const theirs = day({ id: 'dB', date: '2026-11-05', updated_at: T2 });
    const plan = planMerge(local({ days: [mine] }), full({ days: [theirs] }), NOW);
    const byId = new Map(plan.puts.days.map((d) => [d.id, d]));
    expect(byId.get('dB')?.deleted_at).toBeUndefined();
    expect(byId.get('dA')?.deleted_at).toBe(NOW);
    expect(plan.dayDateConflicts).toBe(1);
  });
  it('une journée supprimée ne compte pas comme doublon', () => {
    const mine = day({ id: 'dA', updated_at: T1, deleted_at: T1 });
    const theirs = day({ id: 'dB', updated_at: T0 });
    const plan = planMerge(local({ days: [mine] }), full({ days: [theirs] }), NOW);
    expect(plan.dayDateConflicts).toBe(0);
  });
  it('totaux d\'aperçu', () => {
    const plan = planMerge(
      local({ foods: [food({ updated_at: T0 })] }),
      full({ foods: [food({ name: 'Z', updated_at: T1 }), food({ id: 'f2' })], recipeVersions: [version([line()])] }),
      NOW,
    );
    expect(planTotals(plan)).toEqual({ added: 1, updated: 1, conflicts: 1, newVersions: 1 });
  });
});

describe('format d\'export', () => {
  it('aller-retour JSON', () => {
    const f = full({ foods: [food()], recipes: [recipe()], recipeVersions: [version([line()])], phases: [phase()], days: [day()] });
    const back = parseExport(JSON.stringify(f));
    expect(back).toEqual(f);
  });
  it('JSON invalide', () => {
    expect(() => parseExport('{')).toThrow(ImportError);
  });
  it('schéma postérieur refusé explicitement', () => {
    const f = { ...full(), schema_version: SCHEMA_VERSION + 1 };
    expect(() => parseExport(JSON.stringify(f))).toThrow(/version plus récente/);
  });
  it('structure invalide détectée', () => {
    const f = full({ foods: [food()] });
    (f.data.foods[0] as unknown as Record<string, unknown>).kcal_100g = 'beaucoup';
    expect(() => parseExport(JSON.stringify(f))).toThrow(/foods\[0\]/);
  });
  it('date de journée invalide', () => {
    const f = full({ days: [day({ date: '2026-13-01' })] });
    expect(() => parseExport(JSON.stringify(f))).toThrow(ImportError);
  });
  it('migration depuis un schéma antérieur', () => {
    const migrations = {
      1: (f: Record<string, unknown>) => ({ ...f, migrated_from_1: true }),
      2: (f: Record<string, unknown>) => ({ ...f, migrated_from_2: true }),
    };
    const out = migrateExport({ schema_version: 1 }, 3, migrations);
    expect(out).toEqual({ schema_version: 3, migrated_from_1: true, migrated_from_2: true });
  });
  it('migration manquante : erreur', () => {
    expect(() => migrateExport({ schema_version: 1 }, 2, {})).toThrow(/Aucune migration/);
  });
  it('schema_version absent', () => {
    expect(() => migrateExport({})).toThrow(ImportError);
  });
});
