<script lang="ts">
  import { onDestroy } from 'svelte';
  import { repos } from '../../data';
  import { CIQUAL_ATTRIBUTION } from '../../ciqual/format';
  import { ciqualByCode } from '../../ciqual/load';
  import { unitWeightHint } from '../../domain/amountFormat';
  import { fmtInt, parseNumber } from '../../domain/format';
  import type { Food, MacroKey, Recipe } from '../../domain/types';
  import { unitDefaultsFor, type UnitDefaults } from '../../domain/unitDefaults';
  import { DEFAULT_UNIT_LABEL, tablespoonGrams } from '../../domain/units';
  import { defaultDensity, validateFood, type FoodDraft } from '../../domain/validation';
  import { safeReturnPath, withParam } from '../paths';
  import { go, href, route } from '../router.svelte';
  import { editing } from '../store.svelte';
  import { attempt, notify } from '../toast.svelte';

  let { id }: { id: string } = $props();
  const isNew = $derived(id === 'new');

  /**
   * Retour vers l'écran appelant (ex. la recette en cours, SPEC v1.1 §6.2).
   * Un paramètre invalide est ignoré : on revient alors à la liste des aliments.
   */
  const back = $derived(safeReturnPath(route.query.get('retour')));

  let food = $state<Food | undefined>(undefined);
  let loaded = $state(false);
  let tried = $state(false);
  let saving = $state(false);
  let initial = '';

  /**
   * Champs texte du formulaire (saisie brute, virgule acceptée).
   * unitHalf : arrondi à la ½ unité (unit_step 0,5) ; sinon à l'unité (défaut).
   */
  let f = $state({ name: '', kcal: '', prot: '', carb: '', fat: '', density: '', unitWeight: '', unitLabel: '', unitHalf: false });

  /**
   * Champs d'unité au moment où ils étaient « indicatifs » (pré-remplis), ou null.
   * Toute modification manuelle les rend différents : la mention disparaît.
   */
  let indicativeKey = $state<string | null>(null);
  /** Valeurs indicatives proposées pour un aliment copié en v1 sans poids unitaire. */
  let suggestion = $state<UnitDefaults | null>(null);

  let outdated = $state<Recipe[]>([]);
  let selected = $state<string[]>([]);

  const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
  const unitKey = $derived(`${f.unitWeight}|${f.unitLabel}|${f.unitHalf}`);
  const indicative = $derived(indicativeKey !== null && indicativeKey === unitKey);

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
          unitLabel: x.unit_label ?? '',
          unitHalf: x.unit_step === 0.5,
        };
        indicativeKey = x.unit_indicative ? unitKey : null;
        await refreshOutdated();
        void loadSuggestion(x);
      }
    }
    initial = JSON.stringify(f);
    loaded = true;
  }
  void load();

  /**
   * Aliment Ciqual copié en v1 : le pré-remplissage n'a pas joué. Le sous-groupe
   * n'est pas stocké, on le relit dans la table embarquée par le code Ciqual.
   * Pas de modification automatique : l'utilisateur choisit (SPEC v1.1 §4.3).
   */
  async function loadSuggestion(x: Food) {
    if (x.source !== 'ciqual' || !x.ciqual_code || x.unit_weight_g !== undefined) return;
    try {
      const c = await ciqualByCode(x.ciqual_code);
      const d = c ? unitDefaultsFor({ name: c.name, ssgrp: c.ssgrp }) : null;
      suggestion = d?.unit_weight_g !== undefined ? d : null;
    } catch {
      suggestion = null; // table Ciqual indisponible : pas de proposition, rien de bloquant
    }
  }

  function applySuggestion() {
    if (!suggestion) return;
    f.unitWeight = str(suggestion.unit_weight_g);
    f.unitLabel = suggestion.unit_label ?? '';
    f.unitHalf = suggestion.unit_step === 0.5;
    indicativeKey = unitKey;
    suggestion = null;
  }

  async function refreshOutdated() {
    outdated = await repos().foods.outdatedRecipes(id);
    selected = outdated.map((r) => r.id);
  }

  /** Tous les champs sont présents, à undefined si vides : l'enregistrement efface alors la valeur. */
  const draft = $derived.by(
    (): FoodDraft => ({
      name: f.name,
      kcal_100g: parseNumber(f.kcal),
      prot_100g: parseNumber(f.prot),
      carb_100g: parseNumber(f.carb),
      fat_100g: parseNumber(f.fat),
      density_g_ml: parseNumber(f.density) ?? undefined,
      unit_weight_g: parseNumber(f.unitWeight) ?? undefined,
      unit_label: f.unitLabel.trim() || undefined,
      unit_step: f.unitHalf ? 0.5 : undefined,
      unit_indicative: indicative || undefined,
    }),
  );
  const badNumbers = $derived(
    (['kcal', 'prot', 'carb', 'fat', 'density', 'unitWeight'] as const).filter((k) => f[k].trim() !== '' && parseNumber(f[k]) === null),
  );
  const errors = $derived([...validateFood(draft), ...badNumbers.map(() => 'Une valeur numérique est invalide.').slice(0, 1)]);
  const dirty = $derived(loaded && JSON.stringify(f) !== initial);
  /** Poids d'une c. à soupe, pour vérifier la densité (« 1 c. à soupe = 8 g »). */
  const tbsp = $derived(tablespoonGrams({ density_g_ml: parseNumber(f.density) ?? undefined }));

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

  /** Après enregistrement, retour à l'écran appelant ; un aliment créé y est ajouté (`ajout`). */
  function returnTo(created?: Food): boolean {
    if (!back) return false;
    go(created ? withParam(back, 'ajout', created.id) : back);
    return true;
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
          if (!returnTo(created)) go(`/aliment/${created.id}`);
        }
        return;
      }
      const updated = await attempt(() => r.foods.update(id, draft), 'Aliment enregistré.');
      if (updated) {
        food = updated;
        initial = JSON.stringify(f);
        tried = false;
        editing.dirty = false;
        if (returnTo()) return;
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

{#if back}
  <a class="btn ghost" href={href(back)}>‹ Retour</a>
{:else}
  <a class="btn ghost" href={href('/aliments')}>‹ Aliments</a>
{/if}

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

  <!-- En retour vers une recette, le brouillon relit l'aliment à jour : pas besoin de nouvelles versions ici. -->
  {#if outdated.length > 0 && !back}
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
      <input id="fname" bind:value={f.name} onblur={onNameBlur} required autocomplete="off" />
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
      <span class="small muted">1 c. à soupe = {fmtInt(tbsp)} g. Repères : farine ≈ 0,55, sucre ≈ 0,85, cacao ≈ 0,45.</span>
    </div>

    <h2>À l'unité (fruit, œuf, tranche…)</h2>
    {#if suggestion}
      <p><button type="button" onclick={applySuggestion}>Utiliser les valeurs indicatives ({unitWeightHint(suggestion)})</button></p>
    {/if}
    {#if indicative}<p><span class="badge warn">valeur indicative</span></p>{/if}
    <div class="grid2">
      <div class="field">
        <label for="fuw">Poids d'une unité (g)</label>
        <input id="fuw" inputmode="decimal" bind:value={f.unitWeight} placeholder="vide = pas d'unité" />
        <span class="small muted">Poids sans peau ni noyau.</span>
      </div>
      <div class="field">
        <label for="ful">Libellé</label>
        <input id="ful" bind:value={f.unitLabel} placeholder={DEFAULT_UNIT_LABEL} autocomplete="off" />
      </div>
    </div>
    <label class="check"><input type="checkbox" bind:checked={f.unitHalf} /> Arrondir à la ½ unité (fruits)</label>

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
