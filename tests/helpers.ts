import type { Day, Food, FoodSnapshot, Phase, Recipe, RecipeLine, RecipeVersion, Template } from '../src/domain/types';

export const T0 = '2026-11-01T10:00:00.000Z';
export const T1 = '2026-11-02T10:00:00.000Z';
export const T2 = '2026-11-03T10:00:00.000Z';

export function snap(p: Partial<FoodSnapshot> = {}): FoodSnapshot {
  return { name: 'Riz', kcal_100g: 350, prot_100g: 7, carb_100g: 78, fat_100g: 1, is_unit_item: false, ...p };
}

export function line(p: Partial<RecipeLine> & { snapshot?: Partial<FoodSnapshot> } = {}): RecipeLine {
  const { snapshot, ...rest } = p;
  return { food_id: 'f-riz', food_snapshot: snap(snapshot), quantity: 100, unit: 'g', ...rest };
}

export function version(lines: RecipeLine[], p: Partial<RecipeVersion> = {}): RecipeVersion {
  return { id: 'v1', recipe_id: 'r1', created_at: T0, lines, ...p };
}

export function food(p: Partial<Food> = {}): Food {
  return {
    id: 'f1',
    name: 'Riz',
    source: 'custom',
    kcal_100g: 350,
    prot_100g: 7,
    carb_100g: 78,
    fat_100g: 1,
    missing_flags: [],
    is_unit_item: false,
    archived: false,
    created_at: T0,
    updated_at: T0,
    ...p,
  };
}

export function recipe(p: Partial<Recipe> = {}): Recipe {
  return { id: 'r1', name: 'Bol', category: 'plat', archived: false, created_at: T0, updated_at: T0, ...p };
}

export function phase(p: Partial<Phase> = {}): Phase {
  return { id: 'p1', name: 'Sèche', kcal_target: 1900, start_date: '2026-11-01', created_at: T0, updated_at: T0, ...p };
}

export function day(p: Partial<Day> = {}): Day {
  return {
    id: 'd1',
    date: '2026-11-05',
    status: 'draft',
    kcal_target_snapshot: 1900,
    entries: [],
    created_at: T0,
    updated_at: T0,
    ...p,
  };
}

export function template(p: Partial<Template> = {}): Template {
  return { id: 't1', name: 'Semaine', entries: [], created_at: T0, updated_at: T0, ...p };
}
