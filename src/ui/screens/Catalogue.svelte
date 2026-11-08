<script lang="ts">
  import { repos } from '../../data';
  import { normalize } from '../../ciqual/format';
  import { versionTotals } from '../../domain/calc';
  import { fmt1, fmtInt } from '../../domain/format';
  import { CATEGORIES, type Recipe, type RecipeVersion } from '../../domain/types';
  import { href } from '../router.svelte';
  import { data } from '../store.svelte';

  let recipes = $state<Recipe[]>([]);
  let currents = $state(new Map<string, RecipeVersion>());
  let query = $state('');
  let showArchived = $state(false);

  $effect(() => {
    void data.rev;
    const all = showArchived;
    void Promise.all([repos().recipes.list({ includeArchived: all }), repos().recipes.currents()]).then(([r, c]) => {
      recipes = r;
      currents = c;
    });
  });

  const groups = $derived.by(() => {
    const tokens = normalize(query).split(' ').filter(Boolean);
    const visible = recipes.filter((r) => tokens.every((t) => normalize(r.name).includes(t)));
    return CATEGORIES.map((c) => ({ ...c, recipes: visible.filter((r) => r.category === c.id) })).filter((g) => g.recipes.length);
  });
</script>

<div class="spread">
  <h1>Recettes</h1>
  <a class="btn primary" href={href('/recette/new')}>Nouvelle</a>
</div>

<div class="field">
  <label for="rq">Rechercher</label>
  <input id="rq" type="search" bind:value={query} autocomplete="off" />
</div>
<label class="check"><input type="checkbox" bind:checked={showArchived} /> Afficher les recettes archivées</label>

{#if groups.length === 0}
  <p class="muted">Aucune recette.</p>
{/if}
{#each groups as g (g.id)}
  <h2 class="cat">{g.label}</h2>
  <ul class="list card">
    {#each g.recipes as r (r.id)}
      {@const v = currents.get(r.id)}
      {@const t = v ? versionTotals(v) : null}
      <li>
        <a class="item" href={href(`/recette/${r.id}`)}>
          <span>{r.name} {#if r.archived}<span class="badge">Archivée</span>{/if}</span>
          {#if t}
            <span class="small muted num">{fmtInt(t.kcal)} kcal · {fmt1(t.kcal / 100)} blocs</span>
          {/if}
        </a>
      </li>
    {/each}
  </ul>
{/each}

<style>
  .cat {
    margin-top: 1rem;
    font-size: 0.85rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  ul.card {
    padding: 0 1rem;
  }
</style>
