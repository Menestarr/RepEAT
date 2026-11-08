export const CIQUAL_VERSION = '2025';
export const CIQUAL_FILE = `ciqual-${CIQUAL_VERSION}.json`;
export const CIQUAL_ATTRIBUTION = 'Anses. 2025. Table de composition nutritionnelle des aliments Ciqual';
export const CIQUAL_DOI = 'https://doi.org/10.57745/RDMHWY';
export const CIQUAL_LICENSE = 'Licence Ouverte Etalab 2.0';

/** Bits du champ flags : valeur manquante, « traces » ou « < x » dans la source. */
export const FLAG_KCAL = 1;
export const FLAG_PROT = 2;
export const FLAG_CARB = 4;
export const FLAG_FAT = 8;

/**
 * Ligne du JSON compact : [code, nom, nom_normalisé, kcal, prot, gluc, lip, flags, sous-groupe].
 * Le sous-groupe (alim_ssgrp_code, ex. « 0204 » fruits) sert au pré-remplissage des unités (v1.1).
 */
export type CiqualRow = [string, string, string, number | null, number | null, number | null, number | null, number, string];

export type CiqualFood = {
  code: string;
  name: string;
  norm: string;
  kcal: number | null;
  prot: number | null;
  carb: number | null;
  fat: number | null;
  flags: number;
  /** Sous-groupe Ciqual (alim_ssgrp_code). */
  ssgrp: string;
};

export function fromRow(r: CiqualRow): CiqualFood {
  return { code: r[0], name: r[1], norm: r[2], kcal: r[3], prot: r[4], carb: r[5], fat: r[6], flags: r[7], ssgrp: r[8] ?? '' };
}

export function flagsToKeys(flags: number): ('kcal' | 'prot' | 'carb' | 'fat')[] {
  const out: ('kcal' | 'prot' | 'carb' | 'fat')[] = [];
  if (flags & FLAG_KCAL) out.push('kcal');
  if (flags & FLAG_PROT) out.push('prot');
  if (flags & FLAG_CARB) out.push('carb');
  if (flags & FLAG_FAT) out.push('fat');
  return out;
}

/** NFD, suppression des diacritiques, minuscules, ligatures, ponctuation remplacée par des espaces. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
