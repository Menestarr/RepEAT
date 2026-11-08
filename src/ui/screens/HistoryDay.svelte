<script lang="ts">
  import { repos } from '../../data';
  import { daySummary, portion } from '../../domain/calc';
  import { formatDateFr, formatDateTimeFr } from '../../domain/dates';
  import { fmtBlocks, fmtInt } from '../../domain/format';
  import type { Day, Recipe, RecipeVersion } from '../../domain/types';
  import { versionNumber } from '../../domain/versions';
  import PortionTable from '../components/PortionTable.svelte';
  import { href } from '../router.svelte';
  import { data } from '../store.svelte';

  let { date }: { date: string } = $props();

  let day = $state<Day | undefined>(undefined);
  let loaded = $state(false);
  let rows = $state<{ blocks: number; version: RecipeVersion; recipe?: Recipe; no: number; of: number }[]>([]);

  $effect(() => {
    void data.rev;
    void (async () => {
      const r = repos();
      const d = await r.days.getByDate(date);
      const versions = d ? await r.recipes.getVersions(d.entries.map((e) => e.recipe_version_id)) : new Map<string, RecipeVersion>();
      const out: typeof rows = [];
      for (const e of d?.entries ?? []) {
        const v = versions.get(e.recipe_version_id);
        if (!v) continue;
        const all = await r.recipes.versions(v.recipe_id);
        const recipe = await r.recipes.get(v.recipe_id);
        out.push({ blocks: e.blocks, version: v, recipe, no: versionNumber(all, v.id), of: all.length });
      }
      day = d;
      rows = out;
      loaded = true;
    })();
  });

  const summary = $derived(daySummary(rows, day?.kcal_target_snapshot ?? 0));
</script>

<a class="btn ghost" href={href('/historique')}>‹ Historique</a>
<h1 style="text-transform: capitalize; margin-top: 0.5rem">{formatDateFr(date)}</h1>

{#if !loaded}
  <p class="muted">Chargement…</p>
{:else if !day}
  <p>Aucune journée à cette date.</p>
{:else}
  <p class="num">
    <strong>{fmtBlocks(summary.total_blocks)}</strong> / {fmtBlocks(summary.target_blocks)} blocs
    ({fmtInt(summary.total_kcal)} / {fmtInt(summary.target_kcal)} kcal)
    · <span class="badge" class:ok={day.status === 'validated'}>{day.status === 'validated' ? 'Validée' : 'Brouillon'}</span>
  </p>
  <p class="small muted num">
    P {fmtInt(summary.macros.prot)} g · G {fmtInt(summary.macros.carb)} g · L {fmtInt(summary.macros.fat)} g
  </p>
  {#each rows as r (r.version.id)}
    <section class="card">
      <div class="spread">
        <h2>{r.recipe?.name ?? 'Recette supprimée'}</h2>
        <span class="badge num">{fmtBlocks(r.blocks)} bl</span>
      </div>
      <p class="small muted">Version {r.no} sur {r.of}, du {formatDateTimeFr(r.version.created_at)}</p>
      <PortionTable lines={portion(r.version, r.blocks).lines} />
    </section>
  {/each}
{/if}
