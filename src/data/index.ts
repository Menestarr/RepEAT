import { RepeatDB } from './db';
import { createDexieRepos } from './dexieRepos';
import type { Repos } from './repos';

export type * from './repos';
export { DataError } from './repos';

let instance: Repos | null = null;

/** Repositories de l'application (base IndexedDB « repeat »). */
export function repos(): Repos {
  instance ??= createDexieRepos(new RepeatDB(), __APP_VERSION__);
  return instance;
}
