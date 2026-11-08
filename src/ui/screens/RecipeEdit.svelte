<script lang="ts">
  import { onDestroy } from 'svelte';
  import { repos } from '../../data';
  import { perBlock, versionTotals } from '../../domain/calc';
  import { formatDateTimeFr } from '../../domain/dates';
  import { fmt1, fmtInt, parseNumber } from '../../domain/format';
  import { CATEGORIES, snapshotOf, type Category, type Food, type Recipe, type RecipeLine, type RecipeVersion, type Unit } from '../../domain/types';
  import { validateLines } from '../../domain/validation';
  import { sameLines } from '../../domain/versions';
  import FoodPicker from '../components/FoodPicker.svelte';
  import { go, href } from '../router.svelte';
  import { editing } from '../store.svelte';
  import { attempt, notify } from '../toast.svelte';

  let { id }: { id: string } = $props();
  const isNew = $derived(id === 'new');

  type DraftLine = { key: number; food: Food; quantity: string; unit: Unit };

  let recipe = $state<Recipe | undefined>(undefined);
  let versions = $state<RecipeVersion[]>([]);
  let name = $state('');
  let category = $state<Category>('plat');
  let lines = $state<DraftLine[]>([]);
  let loaded = $state(false);
  let saving = $state(false);
  let tried = $state(false);
  let missingFoods = $state<string[]>([]);
  let keySeq = 0;

  async function load() {
    if (id === 'new') {
      loaded = true;
      return;
    }
    const r = repos();
    const rec = await r.recipes.get(id);
    const vs = await r.recipes.versions(id);
    recipe = rec;
    versions = vs;
    if (rec) {
      name = rec.name;
      category = rec.category;
    }
    const cur = vs.at(-1);
    const missing: string[] = [];
    const draft: DraftLine[] = [];
    for (const l of cur?.lines ?? []) {
      const f = await r.foods.get(l.food_id);
      if (!f || f.deleted_at) {
        missing.push(l.food_snapshot.name);
        continue;
      }
      draft.push({ key: ++keySeq, food: f, quantity: String(l.quantity).replace('.', ','), unit: l.unit });
    }
    lines = draft;
    missingFoods = missing;
    loaded = true;
  }
  void load();

  const preview = $derived<RecipeLine[]>(
    lines.map((l) => ({ food_id: l.food.id, food_snapshot: snapshotOf(l.food), quantity: parseNumber(l.quantity) ?? NaN, unit: l.unit })),
  );
  const errors = $derived(validateLines(preview));
  const totals = $derived(versionTotals({ lines: preview.filter((l) => Number.isFinite(l.quantity)) }));
  const per = $derived(errors.length === 0 ? perBlock({ lines: preview }) : []);
  const current = $derived(versions.at(-1));
  const linesChanged = $derived(!current || !sameLines(current.lines, preview));
  const metaChanged = $derived(!recipe || recipe.name !== name.trim() || recipe.category !== category);
  const dirty = $derived(loaded && (isNew ? lines.length > 0 || name.trim() !== '' : linesChanged || metaChanged));

  $effect(() => {
    editing.dirty = dirty;
  });
  onDestroy(() => (editing.dirty = false));

  /** Un aliment sans kcal est ajouté mais bloque l'enregistrement (validateLines) avec un lien pour le compléter. */
  function addFood(f: Food) {
    lines = [...lines, { key: ++keySeq, food: f, quantity: '', unit: 'g' }];
  }

  function removeLine(key: number) {
    lines = lines.filter((l) => l.key !== key);
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    tried = true;
    if (errors.length > 0 || !name.trim()) return;
    saving = true;
    const newVersion = linesChanged;
    const r = repos();
    const inputs = preview.map((l) => ({ food_id: l.food_id, quantity: l.quantity, unit: l.unit }));
    try {
      if (isNew) {
        const res = await attempt(() => r.recipes.create({ name, category }, inputs), 'Recette créée.');
        if (res) {
          editing.dirty = false;
          go(`/recette/${res.recipe.id}`);
        }
        return;
      }
      if (metaChanged && !(await attempt(() => r.recipes.updateMeta(id, { name, category })))) return;
      if (linesChanged && !(await attempt(() => r.recipes.addVersion(id, inputs)))) return;
      editing.dirty = false;
      await load();
      tried = false;
      notify(newVersion ? 'Nouvelle version enregistrée.' : 'Recette enregistrée.');
    } finally {
      saving = false;
    }
  }

  async function restore(v: RecipeVersion) {
    if (await attempt(() => repos().recipes.restoreVersion(v.id), 'Version restaurée (nouvelle version créée).')) await load();
  }

  async function toggleArchive() {
    if (!recipe) return;
    const r = await attempt(() => repos().recipes.updateMeta(id, { archived: !recipe!.archived }), recipe.archived ? 'Recette désarchivée.' : 'Recette archivée.');
    if (r) recipe = r;
  }
</script>

<a class="btn ghost" href={href('/catalogue')}>‹ Recettes</a>

{#if !loaded}
  <p class="muted">Chargement…</p>
{:else if !isNew && !recipe}
  <p>Recette introuvable.</p>
{:else}
  <h1 style="margin-top: 0.5rem">{isNew ? 'Nouvelle recette' : name || 'Recette'}</h1>
  {#if recipe?.archived}<p><span class="badge">Archivée</span></p>{/if}

  <form onsubmit={save} novalidate>
    <div class="card">
      <div class="field">
        <label for="rname">Nom</label>
        <input id="rname" bind:value={name} required />
      </div>
      <div class="field">
        <label for="rcat">Catégorie</label>
        <select id="rcat" bind:value={category}>
          {#each CATEGORIES as c (c.id)}
            <option value={c.id}>{c.label}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="card">
      <h2>Ingrédients (tels que cuisinés, en cru)</h2>
      {#if missingFoods.length > 0}
        <p class="errors">Aliments introuvables retirés : {missingFoods.join(', ')}.</p>
      {/if}
      {#each lines as l (l.key)}
        <div class="line">
          <div class="grow">
            <div>
              {l.food.name}
              {#if l.food.kcal_100g === null}
                <a class="badge danger" href={href(`/aliment/${l.food.id}`)}>kcal manquant : compléter</a>
              {/if}
            </div>
            <div class="row">
              <label class="sr-only" for="q{l.key}">Quantité de {l.food.name}</label>
              <input id="q{l.key}" class="qty" inputmode="decimal" placeholder="Quantité" bind:value={l.quantity} />
              <label class="sr-only" for="u{l.key}">Unité</label>
              <select id="u{l.key}" class="unit" bind:value={l.unit}>
                <option value="g">g</option>
                <option value="ml">ml</option>
              </select>
              <button type="button" class="ghost" aria-label="Retirer {l.food.name}" onclick={() => removeLine(l.key)}>✕</button>
            </div>
          </div>
        </div>
      {/each}
      <FoodPicker onpick={addFood} exclude={lines.map((l) => l.food.id)} />
    </div>

    <div class="card">
      <h2>Totaux</h2>
      <p class="num">
        <strong>{fmtInt(totals.kcal)} kcal</strong> · <strong>{fmt1(totals.kcal / 100)} blocs</strong><br />
        <span class="muted small">
          P {fmt1(totals.prot)} g · G {fmt1(totals.carb)} g · L {fmt1(totals.fat)} g
        </span>
      </p>
      {#if per.length > 0}
        <h3>Pour 1 bloc (100 kcal)</h3>
        <table class="data">
          <tbody>
            {#each per as p, i (i)}
              <tr>
                <td>{p.name}</td>
                <td class="r num">{fmt1(p.amount)} {p.unit}{#if p.units !== null} <span class="muted small">({fmt1(p.grams / (preview[i]?.food_snapshot.unit_weight_g ?? 1))} u.)</span>{/if}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    {#if tried && (errors.length > 0 || !name.trim())}
      <ul class="errors">
        {#if !name.trim()}<li>Le nom est requis.</li>{/if}
        {#each errors as e (e)}<li>{e}</li>{/each}
      </ul>
    {/if}

    <div class="row wrap">
      <button class="primary" type="submit" disabled={saving || (!isNew && !dirty)}>
        {isNew ? 'Créer la recette' : linesChanged ? 'Enregistrer une nouvelle version' : 'Enregistrer'}
      </button>
      {#if recipe}
        <button type="button" onclick={toggleArchive}>{recipe.archived ? 'Désarchiver' : 'Archiver'}</button>
      {/if}
    </div>
  </form>

  {#if versions.length > 0}
    <section class="card" style="margin-top: 1rem">
      <h2>Historique des versions</h2>
      <ul class="list">
        {#each [...versions].reverse() as v, i (v.id)}
          {@const no = versions.length - i}
          <li>
            <details class="grow">
              <summary>
                Version {no}&nbsp;{#if v.id === current?.id}<span class="badge ok">courante</span>{/if}
                <span class="small muted"> · {formatDateTimeFr(v.created_at)} · {fmtInt(versionTotals(v).kcal)} kcal</span>
              </summary>
              <ul class="small">
                {#each v.lines as l, j (j)}
                  <li>{l.food_snapshot.name} : {fmt1(l.quantity)} {l.unit}</li>
                {/each}
              </ul>
            </details>
            {#if v.id !== current?.id}
              <button class="small" onclick={() => restore(v)}>Restaurer</button>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}

<style>
  .line {
    border-bottom: 1px solid var(--border);
    padding: 0.5rem 0;
    margin-bottom: 0.5rem;
  }
  .qty {
    flex: 1;
  }
  .unit {
    width: 5rem;
  }
  summary {
    min-height: var(--tap);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    cursor: pointer;
  }
</style>
