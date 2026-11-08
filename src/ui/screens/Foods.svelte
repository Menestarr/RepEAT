<script lang="ts">
  import { repos } from '../../data';
  import { normalize } from '../../ciqual/format';
  import { fmtInt } from '../../domain/format';
  import type { Food } from '../../domain/types';
  import FoodPicker from '../components/FoodPicker.svelte';
  import { go, href } from '../router.svelte';
  import { data } from '../store.svelte';

  let foods = $state<Food[]>([]);
  let query = $state('');
  let showArchived = $state(false);

  $effect(() => {
    void data.rev;
    void repos()
      .foods.list({ includeArchived: showArchived })
      .then((f) => (foods = f));
  });

  const visible = $derived.by(() => {
    const tokens = normalize(query).split(' ').filter(Boolean);
    return foods.filter((f) => tokens.every((t) => normalize(f.name).includes(t)));
  });
</script>

<div class="spread">
  <h1>Aliments</h1>
  <a class="btn primary" href={href('/aliment/new')}>Personnalisé</a>
</div>

<div class="card">
  <FoodPicker label="Ajouter depuis Ciqual" onpick={(f) => go(`/aliment/${f.id}`)} />
</div>

<h2>Mes aliments</h2>
<div class="field">
  <label for="fq">Filtrer</label>
  <input id="fq" type="search" bind:value={query} autocomplete="off" />
</div>
<label class="check"><input type="checkbox" bind:checked={showArchived} /> Afficher les aliments archivés</label>

{#if visible.length === 0}
  <p class="muted">Aucun aliment. Les aliments Ciqual sont ajoutés ici à leur première utilisation.</p>
{:else}
  <ul class="list card">
    {#each visible as f (f.id)}
      <li>
        <a class="item" href={href(`/aliment/${f.id}`)}>
          <span>
            {f.name}
            {#if f.archived}<span class="badge">Archivé</span>{/if}
            {#if f.source === 'custom'}<span class="badge">Perso</span>{/if}
          </span>
          <span class="small muted num">
            {#if f.kcal_100g === null}
              <span class="badge danger">kcal manquant</span>
            {:else}
              {fmtInt(f.kcal_100g)} kcal / 100 g
            {/if}
            {#if f.missing_flags.length > 0 && f.kcal_100g !== null}
              <span class="badge warn">valeurs incomplètes</span>
            {/if}
          </span>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  ul.card {
    padding: 0 1rem;
  }
</style>
