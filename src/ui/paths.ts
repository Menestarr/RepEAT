/**
 * Manipulation de chemins internes (« /recette/new?brouillon=… »), sans état.
 * Séparé du routeur (router.svelte.ts) : fonctions pures, non réactives.
 */

/** Lien vers `path` avec un paramètre de retour vers `back` (SPEC v1.1 §6.2). */
export function withReturn(path: string, back: string): string {
  return withParam(path, 'retour', back);
}

/**
 * Valide un paramètre `retour` : seulement un chemin interne commençant par « / »
 * (pas « //hote », pas d'URL absolue). Sinon null.
 */
export function safeReturnPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  return raw;
}

function split(path: string): [string, URLSearchParams] {
  const i = path.indexOf('?');
  return i < 0 ? [path, new URLSearchParams()] : [path.slice(0, i), new URLSearchParams(path.slice(i + 1))];
}

function join(p: string, q: URLSearchParams): string {
  const qs = q.toString();
  return qs ? `${p}?${qs}` : p;
}

/** Ajoute ou remplace un paramètre dans un chemin interne (valeur encodée). */
export function withParam(path: string, key: string, value: string): string {
  const [p, q] = split(path);
  q.set(key, value);
  return join(p, q);
}

/** Retire un paramètre d'un chemin interne. */
export function withoutParam(path: string, key: string): string {
  const [p, q] = split(path);
  q.delete(key);
  return join(p, q);
}
