<script lang="ts">
  import { repos } from '../../data';
  import { formatDateShortFr, todayLocal } from '../../domain/dates';
  import { fmtBlocks, fmtInt } from '../../domain/format';
  import type { Day } from '../../domain/types';
  import { href } from '../router.svelte';
  import { data } from '../store.svelte';

  let days = $state<Day[]>([]);
  let loaded = $state(false);

  $effect(() => {
    void data.rev;
    void repos()
      .days.list()
      .then((d) => {
        days = d;
        loaded = true;
      });
  });

  const today = todayLocal();
  const past = $derived(days.filter((d) => d.date < today));
  const total = (d: Day) => d.entries.reduce((s, e) => s + e.blocks, 0);
</script>

<h1>Historique</h1>
{#if !loaded}
  <p class="muted">Chargement…</p>
{:else if past.length === 0}
  <p class="muted">Aucune journée passée.</p>
{:else}
  <ul class="list card">
    {#each past as d (d.id)}
      <li>
        <a class="item" href={href(`/historique/${d.date}`)}>
          <span style="text-transform: capitalize">{formatDateShortFr(d.date)}</span>
          <span class="small muted num">
            {fmtBlocks(total(d))} / {fmtBlocks(d.kcal_target_snapshot / 100)} blocs · {fmtInt(total(d) * 100)} kcal
          </span>
        </a>
        <span class="badge" class:ok={d.status === 'validated'}>{d.status === 'validated' ? 'Validée' : 'Brouillon'}</span>
      </li>
    {/each}
  </ul>
{/if}
