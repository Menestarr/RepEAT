<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { repos } from '../../data';
  import { aggregate, portion } from '../../domain/calc';
  import { formatDateFr } from '../../domain/dates';
  import { fmtBlocks, fmtInt, fmtSigned } from '../../domain/format';
  import type { Day, Recipe, RecipeVersion } from '../../domain/types';
  import { createWakeLock } from '../../platform';
  import { href } from '../router.svelte';
  import { data } from '../store.svelte';
  import PortionTable from '../components/PortionTable.svelte';

  let { date }: { date: string } = $props();

  let day = $state<Day | undefined>(undefined);
  let versions = $state(new Map<string, RecipeVersion>());
  let recipes = $state(new Map<string, Recipe>());
  let loaded = $state(false);

  const wake = createWakeLock();
  let awake = $state(false);

  onMount(async () => {
    awake = await wake.enable();
  });
  onDestroy(() => void wake.disable());

  async function toggleWake() {
    if (awake) {
      await wake.disable();
      awake = false;
    } else {
      awake = await wake.enable();
    }
  }

  $effect(() => {
    void data.rev;
    void (async () => {
      const r = repos();
      const d = await r.days.getByDate(date);
      const v = d ? await r.recipes.getVersions(d.entries.map((e) => e.recipe_version_id)) : new Map();
      const rs = await r.recipes.list({ includeArchived: true });
      day = d;
      versions = v;
      recipes = new Map(rs.map((x) => [x.id, x]));
      loaded = true;
    })();
  });

  const items = $derived(
    (day?.entries ?? []).flatMap((e) => {
      const v = versions.get(e.recipe_version_id);
      return v ? [{ blocks: e.blocks, version: v, name: recipes.get(v.recipe_id)?.name ?? 'Recette supprimée' }] : [];
    }),
  );

  const agg = $derived(aggregate(items.map((i) => ({ version: i.version, blocks: i.blocks }))));
</script>

<header class="spread">
  <a class="btn ghost" href={href(`/jour?date=${date}`)}>‹ Jour</a>
  {#if wake.supported}
    <button class="ghost small" onclick={toggleWake} aria-pressed={awake}>
      {awake ? 'Écran maintenu allumé' : 'Garder l’écran allumé'}
    </button>
  {/if}
</header>
<h1 class="title">Feuille du {formatDateFr(date)}</h1>

{#if !loaded}
  <p class="muted">Chargement…</p>
{:else if items.length === 0}
  <p>Rien au menu ce jour-là.</p>
{:else}
  {#each items as i (i.version.id)}
    {@const p = portion(i.version, i.blocks)}
    <section class="card">
      <div class="spread">
        <h2>{i.name}</h2>
        <span class="badge num">{fmtBlocks(i.blocks)} bl · {fmtInt(i.blocks * 100)} kcal</span>
      </div>
      <PortionTable lines={p.lines} big />
      {#if Math.round(p.delta_kcal) !== 0}
        <p class="small muted">Écart d'arrondi des unités : {fmtSigned(p.delta_kcal)} kcal</p>
      {/if}
    </section>
  {/each}

  <section class="card">
    <h2>Total par aliment</h2>
    <table class="data big">
      <tbody>
        {#each agg as a (a.food_id)}
          <tr>
            <td>{a.name}</td>
            <td class="r num">
              {#if a.units !== null}
                <strong>{a.units}</strong> u.
                <span class="muted small">({fmtInt(a.grams)} g)</span>
              {:else}
                <strong>{fmtInt(a.amount)}</strong> {a.unit}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

<style>
  .title {
    text-transform: none;
    margin: 0.5rem 0 1rem;
  }
  .big td {
    font-size: 1.2rem;
    padding: 0.55rem 0.3rem;
  }
  .big strong {
    font-size: 1.45rem;
  }
</style>
