<script lang="ts">
  import { repos } from '../../data';
  import { normalize } from '../../ciqual/format';
  import { versionTotals } from '../../domain/calc';
  import { formatAgoFr } from '../../domain/dates';
  import { draftLabel, untitledLabels } from '../../domain/drafts';
  import { fmt1, fmtInt } from '../../domain/format';
  import { CATEGORIES, type Recipe, type RecipeDraft, type RecipeVersion } from '../../domain/types';
  import { href } from '../router.svelte';
  import { data } from '../store.svelte';

  let recipes = $state<Recipe[]>([]);
  let currents = $state(new Map<string, RecipeVersion>());
  let drafts = $state<RecipeDraft[]>([]);
  let query = $state('');
  let showArchived = $state(false);

  $effect(() => {
    void data.rev;
    const all = showArchived;
    const r = repos();
    void Promise.all([r.recipes.list({ includeArchived: all }), r.recipes.currents(), r.drafts.list()]).then(([rs, c, d]) => {
      recipes = rs;
      currents = c;
      drafts = d;
    });
  });

  /** Recettes existantes ayant un brouillon : badge « brouillon ». */
  const drafted = $derived(new Set(drafts.flatMap((d) => (d.recipe_id ? [d.recipe_id] : []))));
  /** Nouvelles recettes non enregistrées, plus récentes d'abord (SPEC v1.1 §6.3). */
  const newDrafts = $derived(drafts.filter((d) => !d.recipe_id).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)));
  const untitled = $derived(untitledLabels(drafts));

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
  <input id="rq" type="search" bind:value={query} autocomplete="off" autocorrect="off" spellcheck="false" />
</div>
<label class="check"><input type="checkbox" bind:checked={showArchived} /> Afficher les recettes archivées</label>

{#if newDrafts.length > 0}
  <h2 class="cat">Brouillons</h2>
  <ul class="list card">
    {#each newDrafts as d (d.id)}
      <li>
        <a class="item" href={href(`/recette/new?brouillon=${d.id}`)}>
          <span>{draftLabel(d, untitled)} <span class="badge warn">brouillon</span></span>
          <span class="small muted">{formatAgoFr(d.updated_at)}</span>
        </a>
      </li>
    {/each}
  </ul>
{/if}

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
          <span>
            {r.name}
            {#if r.archived}<span class="badge">Archivée</span>{/if}
            {#if drafted.has(r.id)}<span class="badge warn">brouillon</span>{/if}
          </span>
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
