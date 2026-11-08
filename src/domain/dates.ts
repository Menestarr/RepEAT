/** Date locale au format YYYY-MM-DD. */
export function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayLocal(): string {
  return toLocalDate(new Date());
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function daysSince(fromIso: string, to: Date = new Date()): number {
  return (to.getTime() - new Date(fromIso).getTime()) / 86_400_000;
}

export function formatDateFr(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function formatDateShortFr(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function formatDateTimeFr(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Durée écoulée lisible : « à l'instant », « il y a 3 min », « il y a 2 h », « il y a 4 j ». */
export function formatAgoFr(fromIso: string, to: Date = new Date()): string {
  const min = Math.floor((to.getTime() - new Date(fromIso).getTime()) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}
