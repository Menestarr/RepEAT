/** Hash router maison : #/jour, #/catalogue… (évite les 404 de GitHub Pages). */

export type Route = { path: string; parts: string[]; query: URLSearchParams };

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/jour';
  const [path = '/jour', qs = ''] = raw.split('?');
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs) };
}

export const route: Route = $state(parse());

window.addEventListener('hashchange', () => {
  Object.assign(route, parse());
  window.scrollTo(0, 0);
});

export function go(path: string): void {
  location.hash = '#' + path;
}

export function href(path: string): string {
  return '#' + path;
}
