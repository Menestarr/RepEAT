import Dexie, { type EntityTable } from 'dexie';
import type { Day, Food, Phase, Recipe, RecipeDraft, RecipeVersion, Template } from '../domain/types';

export type SettingRow = { key: string; value: unknown };

export const DB_NAME = 'repeat';

export class RepeatDB extends Dexie {
  foods!: EntityTable<Food, 'id'>;
  recipes!: EntityTable<Recipe, 'id'>;
  recipeVersions!: EntityTable<RecipeVersion, 'id'>;
  phases!: EntityTable<Phase, 'id'>;
  days!: EntityTable<Day, 'id'>;
  templates!: EntityTable<Template, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;
  /** v1.1 : brouillons de l'écran Recette, locaux à l'appareil (jamais exportés). */
  recipeDrafts!: EntityTable<RecipeDraft, 'id'>;

  constructor(name: string = DB_NAME) {
    super(name);
    // Chaque nouvelle version de schéma ajoute un db.version(n).upgrade() et un test.
    this.version(1).stores({
      foods: 'id, name, ciqual_code',
      recipes: 'id, name, category',
      recipeVersions: 'id, recipe_id, created_at',
      phases: 'id, start_date',
      days: 'id, date',
      templates: 'id',
      settings: 'key',
    });
    // v1.1 : ajout d'une table, aucune donnée existante à transformer.
    // Les champs d'unité des aliments sont optionnels : pas d'upgrade() nécessaire.
    this.version(2).stores({
      recipeDrafts: 'id, recipe_id, updated_at',
    });
  }
}
