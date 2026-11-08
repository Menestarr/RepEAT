import {
  FLAG_CARB,
  FLAG_FAT,
  FLAG_KCAL,
  FLAG_PROT,
  normalize,
  type CiqualRow,
} from '../src/ciqual/format';

/**
 * Constituants retenus (vérifiés dans const_2025_11_03.xml) :
 * - 328   Energie, Règlement UE N° 1169/2011 (kcal/100 g)
 * - 25003 Protéines, N x 6.25 (g/100 g) : facteur du règlement 1169/2011, cohérent avec l'énergie 328
 * - 31000 Glucides (g/100 g)
 * - 40000 Lipides (g/100 g)
 */
export const CONSTITUENTS = { kcal: '328', prot: '25003', carb: '31000', fat: '40000' } as const;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

/**
 * Teneur Ciqual : nombre à virgule décimale, ou « - », « traces », « < 0,5 », vide.
 * Toute valeur non numérique donne null + flag.
 */
export function parseTeneur(raw: string | undefined): { value: number | null; flagged: boolean } {
  if (raw === undefined) return { value: null, flagged: true };
  const t = decodeXml(raw).trim();
  if (!/^-?\d+(,\d+)?$/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) return { value: null, flagged: true };
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? { value: n, flagged: false } : { value: null, flagged: true };
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function field(block: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
  return m?.[1];
}

/** Itère sur les blocs <TAG>...</TAG> d'un XML plat. */
function* blocks(xml: string, tag: string): Generator<string> {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  let i = xml.indexOf(open);
  while (i !== -1) {
    const j = xml.indexOf(close, i);
    if (j === -1) break;
    yield xml.slice(i + open.length, j);
    i = xml.indexOf(open, j + close.length);
  }
}

export function parseAlim(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of blocks(stripBom(xml), 'ALIM')) {
    const code = field(b, 'alim_code')?.trim();
    const name = field(b, 'alim_nom_fr');
    if (code && name) out.set(code, decodeXml(name).trim().replace(/\s+/g, ' '));
  }
  return out;
}

type Wanted = keyof typeof CONSTITUENTS;
const BY_CODE = new Map<string, Wanted>(Object.entries(CONSTITUENTS).map(([k, v]) => [v, k as Wanted]));

export function parseCompo(xml: string): Map<string, Partial<Record<Wanted, string>>> {
  const out = new Map<string, Partial<Record<Wanted, string>>>();
  for (const b of blocks(stripBom(xml), 'COMPO')) {
    const constCode = field(b, 'const_code')?.trim();
    const key = constCode ? BY_CODE.get(constCode) : undefined;
    if (!key) continue;
    const alim = field(b, 'alim_code')?.trim();
    if (!alim) continue;
    const entry = out.get(alim) ?? {};
    entry[key] = field(b, 'teneur') ?? '';
    out.set(alim, entry);
  }
  return out;
}

export function buildRows(alimXml: string, compoXml: string): CiqualRow[] {
  const names = parseAlim(alimXml);
  const compo = parseCompo(compoXml);
  const rows: CiqualRow[] = [];
  for (const [code, name] of names) {
    const c = compo.get(code) ?? {};
    const kcal = parseTeneur(c.kcal);
    const prot = parseTeneur(c.prot);
    const carb = parseTeneur(c.carb);
    const fat = parseTeneur(c.fat);
    const flags =
      (kcal.flagged ? FLAG_KCAL : 0) |
      (prot.flagged ? FLAG_PROT : 0) |
      (carb.flagged ? FLAG_CARB : 0) |
      (fat.flagged ? FLAG_FAT : 0);
    rows.push([code, name, normalize(name), kcal.value, prot.value, carb.value, fat.value, flags]);
  }
  rows.sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  return rows;
}
