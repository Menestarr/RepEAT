import { repos } from '../data';

/** Compteur incrémenté après chaque écriture : les écrans s'y abonnent pour se recharger. */
export const data = $state({ rev: 0 });

repos().onChange(() => {
  data.rev++;
});

/** Saisie en cours (formulaire modifié non enregistré) : bloque le rechargement pour mise à jour. */
export const editing = $state({ dirty: false });
