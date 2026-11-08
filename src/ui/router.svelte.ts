/** Hash router maison : #/jour, #/catalogue… (évite les 404 de GitHub Pages). */

export type Route = { path: string; parts: string[]; query: URLSearchParams };

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/jour';
  const [path = '/jour', qs = ''] = raw.split('?');
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs) };
}

export const route: Route = $state(parse());

window.addEventListener('hashchange', () => {
  const samePath = parse().path === route.path;
  Object.assign(route, parse());
  // Un simple changement de paramètres (ex. ?brouillon=) ne doit pas faire remonter la page.
  if (!samePath) window.scrollTo(0, 0);
});

export function go(path: string): void {
  location.hash = '#' + path;
}

/** Comme go(), mais remplace l'entrée d'historique (le bouton Précédent l'ignore). */
export function replace(path: string): void {
  location.replace('#' + path);
}

export function href(path: string): string {
  return '#' + path;
}

/** Chemin courant avec ses paramètres, tel qu'à passer dans `retour`. */
export function currentPath(): string {
  return location.hash.replace(/^#/, '') || '/jour';
}
