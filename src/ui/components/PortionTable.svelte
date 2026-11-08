<script lang="ts">
  /**
   * Quantités à peser pour N blocs, arrondies au pas de leur unité (SPEC v1.1 §5),
   * avec l'écart d'arrondi par ingrédient et le signalement « arrondi fort ».
   */
  import { formatAmount, hintFor } from '../../domain/amountFormat';
  import type { PortionLine } from '../../domain/calc';
  import { fmtSigned } from '../../domain/format';

  let { lines, big = false }: { lines: PortionLine[]; big?: boolean } = $props();
</script>

<table class="data" class:big>
  <tbody>
    {#each lines as l, i (i)}
      {@const hint = hintFor([l.rounded], l.snapshot)}
      {@const delta = Math.round(l.delta_kcal)}
      <tr class:strong={l.strong}>
        <td>
          {l.name}
          {#if l.strong}<span class="badge warn">arrondi fort</span>{/if}
        </td>
        <td class="r num">
          <strong>{formatAmount(l.rounded, l.snapshot)}</strong>
          {#if hint || delta !== 0}
            <span class="muted small">
              ({[hint, delta !== 0 ? `${fmtSigned(l.delta_kcal)} kcal` : null].filter(Boolean).join(', ')})
            </span>
          {/if}
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .big td {
    font-size: 1.2rem;
    padding: 0.55rem 0.3rem;
  }
  .big strong {
    font-size: 1.45rem;
  }
  tr.strong td {
    color: var(--warn);
  }
</style>
