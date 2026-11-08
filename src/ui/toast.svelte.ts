export type Toast = { id: number; text: string; kind: 'info' | 'error' };

export const toasts: Toast[] = $state([]);

let seq = 0;

export function notify(text: string, kind: Toast['kind'] = 'info'): void {
  const id = ++seq;
  toasts.push({ id, text, kind });
  setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 3000);
}

export function dismiss(id: number): void {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Exécute une action et affiche toute erreur à l'utilisateur. Renvoie undefined en cas d'échec. */
export async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (success) notify(success);
    return r;
  } catch (e) {
    notify(errorText(e), 'error');
    return undefined;
  }
}
