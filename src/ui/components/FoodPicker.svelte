<script lang="ts">
  import { repos } from '../../data';
  import { normalize, type CiqualFood } from '../../ciqual/format';
  import { searchCiqual } from '../../ciqual/load';
  import { fmtInt } from '../../domain/format';
  import type { Food } from '../../domain/types';
  import { attempt, errorText } from '../toast.svelte';

  let {
    onpick,
    label = 'Ajouter un aliment',
    exclude = [],
  }: { onpick: (food: Food) => void; label?: string; exclude?: string[] } = $props();

  let query = $state('');
  let local = $state<Food[]>([]);
  let ciqual = $state<CiqualFood[]>([]);
  let ciqualError = $state('');
  let seq = 0;

  $effect(() => {
    const q = query;
    const n = ++seq;
    if (normalize(q).length < 2) {
      local = [];
      ciqual = [];
      return;
    }
    const t = setTimeout(async () => {
      const tokens = normalize(q).split(' ');
      const foods = await repos().foods.list();
      const l = foods.filter((f) => !exclude.includes(f.id) && tokens.every((tk) => normalize(f.name).includes(tk))).slice(0, 15);
      const codes = new Set(foods.map((f) => f.ciqual_code).filter(Boolean));
      let c: CiqualFood[] = [];
      try {
        c = (await searchCiqual(q, 25)).filter((x) => !codes.has(x.code));
        ciqualError = '';
      } catch (e) {
        ciqualError = errorText(e);
      }
      if (n !== seq) return;
      local = l;
      ciqual = c;
    }, 150);
    return () => clearTimeout(t);
  });

  function pick(f: Food) {
    query = '';
    onpick(f);
  }

  async function pickCiqual(c: CiqualFood) {
    const f = await attempt(() => repos().foods.fromCiqual(c));
    if (f) pick(f);
  }
</script>

<div class="picker">
  <label for="food-q">{label}</label>
  <input id="food-q" type="search" placeholder="Rechercher (mes aliments et Ciqual)" bind:value={query} autocomplete="off" />
  {#if local.length > 0 || ciqual.length > 0 || ciqualError}
    <ul class="list results card">
      {#each local as f (f.id)}
        <li>
          <button type="button" class="ghost item" onclick={() => pick(f)}>
            <span class="grow">{f.name}</span>
            {#if f.kcal_100g === null}
              <span class="badge danger">kcal manquant</span>
            {:else}
              <span class="small muted num">{fmtInt(f.kcal_100g)} kcal</span>
            {/if}
          </button>
        </li>
      {/each}
      {#each ciqual as c (c.code)}
        <li>
          <button type="button" class="ghost item" onclick={() => pickCiqual(c)}>
            <span class="grow">{c.name} <span class="badge">Ciqual</span></span>
            {#if c.kcal === null}
              <span class="badge danger">kcal manquant</span>
            {:else}
              <span class="small muted num">{fmtInt(c.kcal)} kcal</span>
            {/if}
          </button>
        </li>
      {/each}
      {#if ciqualError}<li class="small muted">{ciqualError}</li>{/if}
    </ul>
  {/if}
</div>

<style>
  .results {
    max-height: 50vh;
    overflow-y: auto;
    padding: 0 0.5rem;
    margin-top: 0.4rem;
  }
  .item {
    width: 100%;
    justify-content: space-between;
    text-align: left;
    padding: 0.3rem 0.25rem;
  }
</style>
