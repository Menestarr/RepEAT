const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Entier arrondi, sans « -0 ». */
export function fmtInt(n: number): string {
  const r = Math.round(n);
  return nf0.format(r === 0 ? 0 : r);
}

export function fmt1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return nf1.format(r === 0 ? 0 : r);
}

export function fmtBlocks(n: number): string {
  return nf1.format(n);
}

export function fmtSigned(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '0';
  return (r > 0 ? '+' : '−') + nf0.format(Math.abs(r));
}

/** Lecture d'un champ numérique saisi en français (virgule acceptée). Vide → null. */
export function parseNumber(s: string | number | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
