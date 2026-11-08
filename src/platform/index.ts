/** Fonctions dépendantes du navigateur et de l'appareil. */

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS se présente comme un Mac avec écran tactile.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/** Sur iOS, Safari et l'app installée ne partagent pas le stockage : on bloque hors mode écran d'accueil. */
export function mustInstallFirst(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return isIOS() && nav.standalone !== true;
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function isStoragePersisted(): Promise<boolean | null> {
  if (!navigator.storage?.persisted) return null;
  try {
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}

/** Wake Lock : maintient l'écran allumé, réacquis au retour au premier plan. Sans erreur si absent. */
export function createWakeLock() {
  let sentinel: WakeLockSentinel | null = null;
  let wanted = false;

  async function acquire(): Promise<boolean> {
    if (!('wakeLock' in navigator)) return false;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
      return true;
    } catch {
      return false;
    }
  }

  function onVisibility() {
    if (wanted && document.visibilityState === 'visible' && !sentinel) void acquire();
  }

  return {
    supported: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
    async enable(): Promise<boolean> {
      wanted = true;
      document.addEventListener('visibilitychange', onVisibility);
      return acquire();
    },
    async disable(): Promise<void> {
      wanted = false;
      document.removeEventListener('visibilitychange', onVisibility);
      try {
        await sentinel?.release();
      } catch {
        /* déjà libéré */
      }
      sentinel = null;
    },
  };
}

/**
 * Partage d'un fichier JSON via la feuille de partage (iOS) si disponible, sinon téléchargement.
 * Renvoie 'shared', 'downloaded' ou 'cancelled'.
 */
export async function shareOrDownload(filename: string, json: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([json], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Échec du partage : repli sur le téléchargement.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
