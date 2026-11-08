/**
 * Interfaces de repository : seul point d'accès de l'UI aux données.
 * Une synchronisation (v2) pourra s'implémenter derrière ces interfaces.
 */
import type { CiqualFood } from '../ciqual/format';
import type { ExportFile, ExportType } from '../domain/exportFormat';
import type { MergePlan } from '../domain/merge';
import type { FoodDraft } from '../domain/validation';
import type {
  Category,
  Day,
  DayEntry,
  Food,
  Phase,
  Recipe,
  RecipeDraft,
  RecipeLine,
  RecipeVersion,
  Settings,
  Template,
  TemplateEntry,
} from '../domain/types';

export type ListOptions = { includeArchived?: boolean };

export type LineInput = { food_id: string; quantity: number; unit: RecipeLine['unit'] };

export interface FoodRepo {
  list(opts?: ListOptions): Promise<Food[]>;
  get(id: string): Promise<Food | undefined>;
  /** Plusieurs aliments par id (supprimés compris, avec deleted_at) ; absent = jamais existé. */
  getMany(ids: string[]): Promise<Map<string, Food | undefined>>;
  create(draft: FoodDraft): Promise<Food>;
  /** Copie un aliment Ciqual dans la table foods à sa première utilisation (valeurs figées ensuite). */
  fromCiqual(c: CiqualFood): Promise<Food>;
  update(id: string, patch: Partial<FoodDraft> & { archived?: boolean }): Promise<Food>;
  /** Recettes dont la version courante utilise cet aliment avec un instantané différent de ses valeurs actuelles. */
  outdatedRecipes(foodId: string): Promise<Recipe[]>;
}

/** Enregistrement complet de l'écran Recette : nom, catégorie et lignes. */
export type RecipeSaveInput = {
  /** Absent : création d'une nouvelle recette. */
  recipeId?: string;
  name: string;
  category: Category;
  lines: LineInput[];
  /** Brouillon supprimé dans la même transaction (SPEC v1.1 §6.1). */
  draftId?: string;
};

export type RecipeSaveResult = { recipe: Recipe; version: RecipeVersion; newVersion: boolean };

export interface RecipeRepo {
  list(opts?: ListOptions): Promise<Recipe[]>;
  get(id: string): Promise<Recipe | undefined>;
  create(meta: { name: string; category: Category }, lines: LineInput[]): Promise<{ recipe: Recipe; version: RecipeVersion }>;
  /**
   * Crée ou met à jour une recette en une transaction : métadonnées, nouvelle version
   * si les lignes changent, suppression du brouillon.
   */
  save(input: RecipeSaveInput): Promise<RecipeSaveResult>;
  updateMeta(id: string, patch: Partial<Pick<Recipe, 'name' | 'category' | 'archived'>>): Promise<Recipe>;
  /** Crée une nouvelle version immuable à partir des aliments actuels. Renvoie la version courante si rien n'a changé. */
  addVersion(recipeId: string, lines: LineInput[]): Promise<RecipeVersion>;
  /** Restaurer = nouvelle version aux lignes identiques (instantanés compris). */
  restoreVersion(versionId: string): Promise<RecipeVersion>;
  versions(recipeId: string): Promise<RecipeVersion[]>;
  current(recipeId: string): Promise<RecipeVersion | undefined>;
  /** Version courante de chaque recette (non supprimée). */
  currents(): Promise<Map<string, RecipeVersion>>;
  getVersions(ids: string[]): Promise<Map<string, RecipeVersion>>;
  /** Nouvelles versions des recettes données avec les valeurs actuelles de l'aliment. */
  refreshFood(recipeIds: string[], foodId: string): Promise<number>;
}

/**
 * Brouillons de l'écran Recette. Locaux à l'appareil : hors export, import et fusion.
 * Les écritures ne déclenchent pas onChange (enregistrement à chaque frappe).
 */
export interface DraftRepo {
  list(): Promise<RecipeDraft[]>;
  get(id: string): Promise<RecipeDraft | undefined>;
  put(draft: RecipeDraft): Promise<void>;
  remove(id: string): Promise<void>;
  /** Supprime les brouillons de plus de 30 jours. Renvoie le nombre supprimé. */
  purge(): Promise<number>;
}

export interface PhaseRepo {
  list(): Promise<Phase[]>;
  create(p: { name: string; kcal_target: number; start_date: string }): Promise<Phase>;
  update(id: string, patch: Partial<Pick<Phase, 'name' | 'kcal_target' | 'start_date'>>): Promise<Phase>;
  remove(id: string): Promise<void>;
}

export interface DayRepo {
  list(): Promise<Day[]>;
  getByDate(date: string): Promise<Day | undefined>;
  create(date: string, kcal_target: number, entries: DayEntry[]): Promise<Day>;
  update(id: string, patch: Partial<Pick<Day, 'entries' | 'status' | 'kcal_target_snapshot'>>): Promise<Day>;
  remove(id: string): Promise<void>;
}

export interface TemplateRepo {
  list(): Promise<Template[]>;
  create(name: string, entries: TemplateEntry[]): Promise<Template>;
  remove(id: string): Promise<void>;
}

export interface SettingsRepo {
  get(): Promise<Settings>;
  set(patch: Partial<Settings>): Promise<void>;
}

export interface BackupRepo {
  isEmpty(): Promise<boolean>;
  exportData(type: ExportType): Promise<ExportFile>;
  /** Aperçu de la fusion sans rien écrire. */
  preview(file: ExportFile): Promise<MergePlan>;
  /** Fusion dans une seule transaction (le plan est recalculé à l'intérieur). */
  apply(file: ExportFile): Promise<MergePlan>;
}

export type Repos = {
  foods: FoodRepo;
  recipes: RecipeRepo;
  drafts: DraftRepo;
  phases: PhaseRepo;
  days: DayRepo;
  templates: TemplateRepo;
  settings: SettingsRepo;
  backup: BackupRepo;
  /** Notifié après chaque écriture réussie. Renvoie la fonction de désabonnement. */
  onChange(cb: () => void): () => void;
};

export class DataError extends Error {}
