<script lang="ts">
  import { onDestroy } from 'svelte';
  import { repos } from '../../data';
  import { CIQUAL_ATTRIBUTION } from '../../ciqual/format';
  import { parseNumber } from '../../domain/format';
  import type { Food, MacroKey, Recipe } from '../../domain/types';
  import { defaultDensity, validateFood, type FoodDraft } from '../../domain/validation';
  import { go, href } from '../router.svelte';
  import { editing } from '../store.svelte';
  import { attempt, notify } from '../toast.svelte';

  let { id }: { id: string } = $props();
  const isNew = $derived(id === 'new');

  let food = $state<Food | undefined>(undefined);
  let loaded = $state(false);
  let tried = $state(false);
  let saving = $state(false);
  let initial = '';

  let f = $state({ name: '', kcal: '', prot: '', carb: '', fat: '', density: '', unitWeight: '', isUnit: false });

  let outdated = $state<Recipe[]>([]);
  let selected = $state<string[]>([]);

  const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

  async function load() {
    if (id !== 'new') {
      const x = await repos().foods.get(id);
      food = x;
      if (x) {
        f = {
          name: x.name,
          kcal: str(x.kcal_100g),
          prot: str(x.prot_100g),
          carb: str(x.carb_100g),
          fat: str(x.fat_100g),
          density: str(x.density_g_ml),
          unitWeight: str(x.unit_weight_g),
          isUnit: x.is_unit_item,
        };
        await refreshOutdated();
      }
    }
    initial = JSON.stringify(f);
    loaded = true;
  }
  void load();

  async function refreshOutdated() {
    outdated = await repos().foods.outdatedRecipes(id);
    selected = outdated.map((r) => r.id);
  }

  const draft = $derived.by((): FoodDraft => {
    const d: FoodDraft = {
      name: f.name,
      kcal_100g: parseNumber(f.kcal),
      prot_100g: parseNumber(f.prot),
      carb_100g: parseNumber(f.carb),
      fat_100g: parseNumber(f.fat),
      is_unit_item: f.isUnit,
    };
    const dens = parseNumber(f.density);
    const uw = parseNumber(f.unitWeight);
    if (dens !== null) d.density_g_ml = dens;
    if (uw !== null) d.unit_weight_g = uw;
    return d;
  });
  const badNumbers = $derived(
    (['kcal', 'prot', 'carb', 'fat', 'density', 'unitWeight'] as const).filter((k) => f[k].trim() !== '' && parseNumber(f[k]) === null),
  );
  const errors = $derived([...validateFood(draft), ...badNumbers.map(() => 'Une valeur numérique est invalide.').slice(0, 1)]);
  const dirty = $derived(loaded && JSON.stringify(f) !== initial);

  $effect(() => {
    editing.dirty = dirty;
  });
  onDestroy(() => (editing.dirty = false));

  function flagged(k: MacroKey): boolean {
    return !!food?.missing_flags.includes(k);
  }

  function onNameBlur() {
    if (f.density === '') {
      const d = defaultDensity(f.name);
      if (d !== undefined) f.density = str(d);
    }
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    tried = true;
    if (errors.length) return;
    saving = true;
    try {
      const r = repos();
      if (isNew) {
        const created = await attempt(() => r.foods.create(draft), 'Aliment créé.');
        if (created) {
          editing.dirty = false;
          go(`/aliment/${created.id}`);
        }
        return;
      }
      const patch = { ...draft, density_g_ml: draft.density_g_ml, unit_weight_g: draft.unit_weight_g };
      const updated = await attempt(() => r.foods.update(id, patch), 'Aliment enregistré.');
      if (updated) {
        food = updated;
        initial = JSON.stringify(f);
        tried = false;
        await refreshOutdated();
      }
    } finally {
      saving = false;
    }
  }

  async function createVersions() {
    const n = await attempt(() => repos().recipes.refreshFood(selected, id));
    if (n !== undefined) {
      notify(`${n} nouvelle(s) version(s) créée(s).`);
      await refreshOutdated();
    }
  }

  async function toggleArchive() {
    if (!food) return;
    const u = await attempt(() => repos().foods.update(id, { archived: !food!.archived }));
    if (u) food = u;
  }
</script>

<a class="btn ghost" href={href('/aliments')}>‹ Aliments</a>

{#if !loaded}
  <p class="muted">Chargement…</p>
{:else if !isNew && !food}
  <p>Aliment introuvable.</p>
{:else}
  <h1 style="margin-top: 0.5rem">{isNew ? 'Aliment personnalisé' : f.name}</h1>
  {#if food?.source === 'ciqual'}
    <p class="small muted">Ciqual {food.ciqual_version}, code {food.ciqual_code}. Valeurs copiées et figées à l'ajout. Source : {CIQUAL_ATTRIBUTION}.</p>
  {/if}
  {#if food && food.kcal_100g === null}
    <p class="errors">Valeur kcal manquante : complétez-la pour utiliser cet aliment dans une recette.</p>
  {/if}

  {#if outdated.length > 0}
    <div class="card warnbox">
      <h2>Recettes concernées</h2>
      <p class="small">Les versions existantes ne changent pas. Créer une nouvelle version avec les valeurs actuelles pour :</p>
      {#each outdated as r (r.id)}
        <label class="check"><input type="checkbox" value={r.id} bind:group={selected} /> {r.name}</label>
      {/each}
      <button class="primary" disabled={selected.length === 0} onclick={createVersions}>Créer les nouvelles versions</button>
    </div>
  {/if}

  <form class="card" onsubmit={save} novalidate>
    <div class="field">
      <label for="fname">Nom</label>
      <input id="fname" bind:value={f.name} onblur={onNameBlur} required />
    </div>
    <p class="small muted">Valeurs pour 100 g, aliment cru.</p>
    <div class="grid2">
      <div class="field">
        <label for="fkcal">kcal {#if flagged('kcal')}<span class="badge warn">absent de la source</span>{/if}</label>
        <input id="fkcal" inputmode="decimal" bind:value={f.kcal} class:missing={f.kcal.trim() === ''} />
      </div>
      <div class="field">
        <label for="fprot">Protéines (g) {#if flagged('prot')}<span class="badge warn">source</span>{/if}</label>
        <input id="fprot" inputmode="decimal" bind:value={f.prot} />
      </div>
      <div class="field">
        <label for="fcarb">Glucides (g) {#if flagged('carb')}<span class="badge warn">source</span>{/if}</label>
        <input id="fcarb" inputmode="decimal" bind:value={f.carb} />
      </div>
      <div class="field">
        <label for="ffat">Lipides (g) {#if flagged('fat')}<span class="badge warn">source</span>{/if}</label>
        <input id="ffat" inputmode="decimal" bind:value={f.fat} />
      </div>
    </div>
    <p class="small muted">« source » : valeur manquante, « traces » ou « &lt; x » dans Ciqual, à compléter si besoin.</p>
    <div class="field">
      <label for="fdens">Densité (g/ml, vide = 1)</label>
      <input id="fdens" inputmode="decimal" bind:value={f.density} placeholder="1" />
    </div>
    <label class="check"><input type="checkbox" bind:checked={f.isUnit} /> Aliment à l'unité (œuf, fruit…)</label>
    {#if f.isUnit}
      <div class="field">
        <label for="fuw">Poids d'une unité (g)</label>
        <input id="fuw" inputmode="decimal" bind:value={f.unitWeight} />
      </div>
    {/if}

    {#if tried && errors.length}
      <ul class="errors">
        {#each errors as e (e)}<li>{e}</li>{/each}
      </ul>
    {/if}
    <div class="row wrap">
      <button class="primary" type="submit" disabled={saving || (!isNew && !dirty)}>{isNew ? 'Créer' : 'Enregistrer'}</button>
      {#if food}
        <button type="button" onclick={toggleArchive}>{food.archived ? 'Désarchiver' : 'Archiver'}</button>
      {/if}
    </div>
  </form>
{/if}

<style>
  .missing {
    border-color: var(--danger);
    background: var(--danger-soft);
  }
  .warnbox {
    border-color: var(--warn);
  }
</style>
