/**
 * Prétraitement Ciqual 2025 → public/ciqual-2025.json
 *
 * Source : https://doi.org/10.57745/RDMHWY (Recherche Data Gouv, Licence Ouverte Etalab 2.0).
 * Les XML (UTF-8 avec BOM) sont lus depuis CIQUAL_DIR (défaut : data-src/ciqual-2025/, non versionné)
 * et téléchargés s'ils sont absents. compo_*.xml pèse ~69 Mo.
 *
 * Usage : npm run build:ciqual
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CIQUAL_FILE } from '../src/ciqual/format';
import { buildRows } from './ciqual-parse';

const DIR = resolve(process.env.CIQUAL_DIR ?? 'data-src/ciqual-2025');
const FILES = {
  alim: { name: 'alim_2025_11_03.xml', id: 666252 },
  compo: { name: 'compo_2025_11_03.xml', id: 666249 },
};
const DOWNLOAD = 'https://entrepot.recherche.data.gouv.fr/api/access/datafile/';

async function ensure(f: { name: string; id: number }): Promise<string> {
  const path = join(DIR, f.name);
  if (!existsSync(path)) {
    mkdirSync(DIR, { recursive: true });
    console.log(`Téléchargement de ${f.name}…`);
    const res = await fetch(DOWNLOAD + f.id);
    if (!res.ok) throw new Error(`Téléchargement de ${f.name} : HTTP ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(path, 'utf8');
}

const rows = buildRows(await ensure(FILES.alim), await ensure(FILES.compo));
const out = resolve('public', CIQUAL_FILE);
writeFileSync(out, '[\n' + rows.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n');
const noKcal = rows.filter((r) => r[3] === null).length;
console.log(`${rows.length} aliments écrits dans ${out} (${noKcal} sans kcal).`);
