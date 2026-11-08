<script lang="ts">
  /**
   * Champ kcal éditable de la composition du jour (SPEC v1.1 §6 bis).
   * Affiche les kcal et, en dessous, les blocs. Un appui sélectionne la valeur pour la
   * remplacer ; validation par OK / Entrée / perte du focus, Échap annule.
   * L'interprétation de la saisie (arrondi au demi-bloc, 0 = retirer) est dans
   * domain/dayInput.ts ; ce composant ne fait que la transmettre.
   */
  import { parseKcalInput, type KcalInput } from '../../domain/dayInput';
  import { fmtBlocks, fmtInt } from '../../domain/format';

  let {
    blocks,
    suggested,
    label,
    disabled = false,
    oncommit,
  }: {
    /** Blocs actuels ; 0 si la recette n'est pas encore dans la journée. */
    blocks: number;
    /** Valeur proposée quand blocks = 0 (ajout depuis la recherche) : validée telle quelle par Entrée. */
    suggested?: number;
    /** Nom accessible du champ. */
    label: string;
    disabled?: boolean;
    oncommit: (input: Exclude<KcalInput, { kind: 'invalid' }>) => void;
  } = $props();

  const shown = $derived(blocks > 0 ? fmtInt(blocks * 100) : suggested !== undefined ? fmtInt(suggested) : '');
  let text = $state('');
  let editing = $state(false);
  /** Entrée pressée : valide même une valeur inchangée (cas de la valeur proposée). */
  let force = false;
  let cancelled = false;

  // Hors édition, le champ suit la valeur enregistrée.
  $effect(() => {
    if (!editing) text = shown;
  });

  function onfocus(e: FocusEvent) {
    editing = true;
    force = false;
    cancelled = false;
    (e.currentTarget as HTMLInputElement).select();
  }

  function onkeydown(e: KeyboardEvent) {
    const input = e.currentTarget as HTMLInputElement;
    if (e.key === 'Enter') {
      e.preventDefault();
      force = true;
      input.blur();
    } else if (e.key === 'Escape') {
      cancelled = true;
      input.blur();
    }
  }

  function onblur() {
    editing = false;
    const raw = text;
    text = shown;
    if (cancelled || (raw === shown && !force)) return;
    const r = parseKcalInput(raw);
    // Valeur vide, négative ou non numérique : on garde l'ancienne valeur.
    if (r.kind === 'invalid') return;
    // Rien à retirer si la recette n'est pas dans la journée.
    if (r.kind === 'remove' && blocks === 0) return;
    oncommit(r);
  }
</script>

<div class="kcal" class:suggested={blocks === 0}>
  <span class="value">
    <input
      type="text"
      inputmode="numeric"
      enterkeyhint="done"
      aria-label={label}
      autocomplete="off"
      {disabled}
      bind:value={text}
      {onfocus}
      {onkeydown}
      {onblur}
    />
    <span class="small muted">kcal</span>
  </span>
  {#if blocks > 0}<span class="small muted num">{fmtBlocks(blocks)} bloc{blocks >= 2 ? 's' : ''}</span>{/if}
</div>

<style>
  .kcal {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .value {
    display: flex;
    align-items: baseline;
    gap: 0.2rem;
  }
  input {
    width: 4rem;
    text-align: center;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding-left: 0.25rem;
    padding-right: 0.25rem;
  }
  .suggested input {
    font-weight: 400;
    color: var(--muted);
  }
  span {
    line-height: 1.2;
  }
</style>
