<script lang="ts">
  import type { PortionLine } from '../../domain/calc';
  import { fmtInt, fmtSigned } from '../../domain/format';

  let { lines, big = false }: { lines: PortionLine[]; big?: boolean } = $props();
</script>

<table class="data" class:big>
  <tbody>
    {#each lines as l, i (i)}
      <tr class:zero={l.zero}>
        <td>
          {l.name}
          {#if l.zero}<span class="badge warn">0 à peser</span>{/if}
        </td>
        <td class="r num">
          {#if l.units !== null}
            <strong>{l.units}</strong> u.
            <span class="muted small">
              ({fmtInt(l.grams)} g{#if Math.round(l.delta_kcal) !== 0}, {fmtSigned(l.delta_kcal)} kcal{/if})
            </span>
          {:else}
            <strong>{fmtInt(l.amount)}</strong> {l.unit}
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
  tr.zero td {
    color: var(--warn);
  }
</style>
