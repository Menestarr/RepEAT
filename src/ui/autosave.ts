/**
 * Enregistrement automatique (brouillons, SPEC v1.1 §6.1) :
 * - différé de `delayMs` après la dernière modification ;
 * - immédiat quand la page passe en arrière-plan ou se ferme (pagehide,
 *   visibilitychange) : iOS peut tuer l'app en arrière-plan sans autre événement ;
 * - les écritures sont sérialisées (jamais deux en parallèle, la dernière gagne).
 *
 * Usage : `schedule()` à chaque modification, `flush()` avant de quitter l'écran,
 * `close()` quand plus rien ne doit être écrit (recette enregistrée).
 */
export class Autosave {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending = false;
  private closed = false;
  private chain: Promise<void> = Promise.resolve();

  private readonly save: () => Promise<void>;
  private readonly delayMs: number;

  constructor(save: () => Promise<void>, delayMs: number) {
    this.save = save;
    this.delayMs = delayMs;
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private readonly onPageHide = () => void this.flush();
  private readonly onVisibility = () => {
    if (document.visibilityState === 'hidden') void this.flush();
  };

  /** Signale une modification : écriture après le délai. */
  schedule(): void {
    if (this.closed) return;
    this.pending = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  /** Écrit tout de suite s'il y a une modification en attente ; attend la fin de l'écriture. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.pending && !this.closed) {
      this.pending = false;
      this.chain = this.chain.then(this.save).catch(() => {
        // L'échec est signalé par `save` lui-même ; on garde la chaîne utilisable.
      });
    }
    return this.chain;
  }

  /** Abandonne toute écriture en attente (sans l'exécuter) et attend celle en cours. */
  cancel(): Promise<void> {
    clearTimeout(this.timer);
    this.pending = false;
    return this.chain;
  }

  /** Reprend après close() (ex. formulaire rechargé après enregistrement). */
  reopen(): void {
    this.closed = false;
  }

  /** Plus aucune écriture jusqu'à reopen() ; attend celle en cours. */
  close(): Promise<void> {
    this.closed = true;
    return this.cancel();
  }

  /** Retire les écouteurs ; à appeler à la destruction de l'écran (après flush). */
  dispose(): void {
    clearTimeout(this.timer);
    window.removeEventListener('pagehide', this.onPageHide);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
