<script lang="ts">
  /**
   * Écran Recette : création, modification (nouvelle version immuable), historique.
   *
   * Brouillons (SPEC v1.1 §6) : toute modification est enregistrée en continu dans
   * IndexedDB (Autosave) et restaurée au retour, quelle que soit la cause de la sortie.
   * Il n'y a donc plus de confirmation « modifications non enregistrées » ici.
   * - recette existante : brouillon d'id = recipe_id, écrit seulement si le formulaire
   *   diffère de la version courante ;
   * - nouvelle recette : brouillon d'id aléatoire placé dans l'URL (?brouillon=),
   *   pour que le retour depuis l'écran Aliment et le bouton Précédent le retrouvent.
   */
  import { onDestroy } from 'svelte';
  import { repos } from '../../data';
  import { perBlock, versionTotals } from '../../domain/calc';
  import { formatAgoFr, formatDateTimeFr, nowIso } from '../../domain/dates';
  import { DRAFT_SAVE_DELAY_MS, restoreDraftLines, type RestoredLine } from '../../domain/drafts';
  import { fmt1, fmtInt, parseNumber } from '../../domain/format';
  import {
    CATEGORIES,
    snapshotOf,
    type Category,
    type DraftLine,
    type Food,
    type Recipe,
    type RecipeDraft,
    type RecipeLine,
    type RecipeVersion,
  } from '../../domain/types';
  import { availableUnits, defaultUnit, unitOptionLabel } from '../../domain/units';
  import { validateLines } from '../../domain/validation';
  import { sameLines } from '../../domain/versions';
  import { Autosave } from '../autosave';
  import FoodPicker from '../components/FoodPicker.svelte';
  import PortionTable from '../components/PortionTable.svelte';
  import { withoutParam, withReturn } from '../paths';
  import { currentPath, go, href, replace, route } from '../router.svelte';
  import { attempt, notify } from '../toast.svelte';

  let { id }: { id: string } = $props();
  const isNew = $derived(id === 'new');

  /** Ligne du formulaire ; `unitReset` : unité repassée de `u` à g (aliment sans poids unitaire). */
  type FormLine = RestoredLine & { key: number };

  let recipe = $state<Recipe | undefined>(undefined);
  let versions = $state<RecipeVersion[]>([]);
  let name = $state('');
  let category = $state<Category>('plat');
  let lines = $state<FormLine[]>([]);
  let loaded = $state(false);
  let saving = $state(false);
  let tried = $state(false);
  /** Aliments supprimés retirés du formulaire (version ou brouillon). */
  let missingFoods = $state<string[]>([]);
  let keySeq = 0;

  // ----- État du brouillon -----
  let draftId = '';
  let draftCreatedAt = '';
  /** Version courante quand le brouillon a été commencé. */
  let draftBase: string | undefined;
  /** Date du brouillon restauré à l'ouverture (bandeau), null sinon. */
  let restoredAt = $state<string | null>(null);
  /** La recette a reçu une nouvelle version (import) depuis le début du brouillon. */
  let conflict = $state(false);
  /** Un brouillon existe en base pour cet écran. */
  let hasDraft = false;

  const current = $derived(versions.at(-1));

  function toFormLines(restored: RestoredLine[]): FormLine[] {
    return restored.map((l) => ({ ...l, key: ++keySeq }));
  }

  /** Relit les aliments des lignes (brouillon ou version) depuis la base. */
  async function restoreLines(src: DraftLine[]) {
    const ids = [...new Set(src.map((l) => l.food_id))];
    const foods = await repos().foods.getMany(ids);
    return restoreDraftLines(src, foods);
  }

  /** Remplit le formulaire depuis la version courante (ou vide pour une nouvelle recette). */
  async function fillFromVersion() {
    name = recipe?.name ?? '';
    category = recipe?.category ?? 'plat';
    const src = (current?.lines ?? []).map((l) => ({ food_id: l.food_id, quantity: String(l.quantity).replace('.', ','), unit: l.unit }));
    const r = await restoreLines(src);
    lines = toFormLines(r.lines);
    missingFoods = r.removed;
  }

  async function load() {
    const r = repos();
    if (isNew) {
      draftId = route.query.get('brouillon') ?? '';
      if (!draftId) {
        draftId = crypto.randomUUID();
        // Remplace l'entrée d'historique : Précédent ne ramène pas à une URL sans brouillon.
        replace(`/recette/new?brouillon=${draftId}`);
      }
    } else {
      draftId = id;
      recipe = await r.recipes.get(id);
      versions = await r.recipes.versions(id);
    }
    await fillFromVersion();

    const d = await r.drafts.get(draftId);
    hasDraft = !!d;
    draftBase = d ? d.base_version_id : current?.id;
    draftCreatedAt = d?.created_at ?? nowIso();
    if (d) {
      name = d.name;
      category = d.category;
      const restored = await restoreLines(d.lines);
      lines = toFormLines(restored.lines);
      missingFoods = restored.removed;
      restoredAt = d.updated_at;
      conflict = !isNew && d.base_version_id !== current?.id;
    }
    await addFromReturn();
    // Déclenche le premier passage de l'effet d'enregistrement : une nouvelle recette
    // a ainsi un brouillon dès l'ouverture, même vide (SPEC v1.1 §6.3).
    loaded = true;
  }

  /** Retour de « Créer un aliment personnalisé » : l'aliment créé devient une nouvelle ligne. */
  async function addFromReturn() {
    const foodId = route.query.get('ajout');
    if (!foodId) return;
    const f = await repos().foods.get(foodId);
    if (f && !f.deleted_at && !lines.some((l) => l.food.id === f.id)) addFood(f);
    replace(withoutParam(currentPath(), 'ajout'));
  }

  // ----- Brouillon : enregistrement continu -----

  /** Contenu du formulaire tel que stocké dans le brouillon. */
  const draftLines = $derived<DraftLine[]>(lines.map((l) => ({ food_id: l.food.id, quantity: l.quantity, unit: l.unit })));

  async function writeDraft() {
    const r = repos();
    // Recette existante revenue à l'identique : plus rien à garder.
    if (!isNew && !dirty) {
      if (hasDraft) await attempt(() => r.drafts.remove(draftId));
      hasDraft = false;
      return;
    }
    const d: RecipeDraft = {
      id: draftId,
      name,
      category,
      lines: $state.snapshot(draftLines),
      created_at: draftCreatedAt,
      updated_at: nowIso(),
    };
    if (!isNew) d.recipe_id = id;
    if (draftBase !== undefined) d.base_version_id = draftBase;
    if (await attempt(() => r.drafts.put(d))) hasDraft = true;
  }

  const autosave = new Autosave(writeDraft, DRAFT_SAVE_DELAY_MS);

  // Chaque modification (nom, catégorie, lignes, quantités, unités) programme une écriture.
  $effect(() => {
    void JSON.stringify([name, category, draftLines]);
    if (loaded) autosave.schedule();
  });

  // Sortie de l'écran (autre onglet, Précédent, lien) : écriture immédiate.
  onDestroy(() => {
    void autosave.flush().then(() => autosave.dispose());
  });

  /** Navigation vers un autre écran avec retour ici, après avoir écrit le brouillon. */
  async function leaveWithReturn(path: string) {
    await autosave.flush();
    go(withReturn(path, currentPath()));
  }

  async function discardDraft() {
    if (!confirm('Abandonner le brouillon ? Les modifications non enregistrées seront perdues.')) return;
    await autosave.cancel();
    await attempt(() => repos().drafts.remove(draftId));
    hasDraft = false;
    restoredAt = null;
    conflict = false;
    draftBase = current?.id;
    draftCreatedAt = nowIso();
    await fillFromVersion();
  }

  /** « Garder mon brouillon » : il repart de la version courante, le conflit est levé. */
  function keepDraft() {
    draftBase = current?.id;
    conflict = false;
    autosave.schedule();
  }

  // ----- Formulaire -----

  const preview = $derived<RecipeLine[]>(
    lines.map((l) => ({ food_id: l.food.id, food_snapshot: snapshotOf(l.food), quantity: parseNumber(l.quantity) ?? NaN, unit: l.unit })),
  );
  const errors = $derived(validateLines(preview));
  const totals = $derived(versionTotals({ lines: preview.filter((l) => Number.isFinite(l.quantity)) }));
  const per = $derived(errors.length === 0 ? perBlock({ lines: preview }) : []);
  const linesChanged = $derived(!current || !sameLines(current.lines, preview));
  const metaChanged = $derived(!recipe || recipe.name !== name.trim() || recipe.category !== category);
  const dirty = $derived(loaded && (isNew ? lines.length > 0 || name.trim() !== '' : linesChanged || metaChanged));

  /** Un aliment sans kcal est ajouté mais bloque l'enregistrement (validateLines) avec un lien pour le compléter. */
  function addFood(f: Food) {
    lines = [...lines, { key: ++keySeq, food: f, quantity: '', unit: defaultUnit(f), unitReset: false }];
  }

  function removeLine(key: number) {
    lines = lines.filter((l) => l.key !== key);
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    tried = true;
    if (errors.length > 0 || !name.trim()) return;
    saving = true;
    // Plus d'écriture de brouillon : il est supprimé dans la transaction d'enregistrement.
    await autosave.close();
    const inputs = preview.map((l) => ({ food_id: l.food_id, quantity: l.quantity, unit: l.unit }));
    try {
      const res = await attempt(() =>
        repos().recipes.save({ recipeId: isNew ? undefined : id, name, category, lines: inputs, draftId }),
      );
      if (!res) {
        autosave.reopen();
        autosave.schedule();
        return;
      }
      hasDraft = false;
      if (isNew) {
        notify('Recette créée.');
        // replace : Précédent ne revient pas sur le brouillon, désormais supprimé.
        replace(`/recette/${res.recipe.id}`);
        return;
      }
      notify(res.newVersion ? 'Nouvelle version enregistrée.' : 'Recette enregistrée.');
      recipe = res.recipe;
      versions = await repos().recipes.versions(id);
      restoredAt = null;
      conflict = false;
      draftBase = current?.id;
      draftCreatedAt = nowIso();
      await fillFromVersion();
      tried = false;
      autosave.reopen();
    } finally {
      saving = false;
    }
  }

  async function restore(v: RecipeVersion) {
    if (!(await attempt(() => repos().recipes.restoreVersion(v.id), 'Version restaurée (nouvelle version créée).'))) return;
    versions = await repos().recipes.versions(id);
    draftBase = current?.id;
    await fillFromVersion();
  }

  async function toggleArchive() {
    if (!recipe) return;
    const r = await attempt(() => repos().recipes.updateMeta(id, { archived: !recipe!.archived }), recipe.archived ? 'Recette désarchivée.' : 'Recette archivée.');
    if (r) recipe = r;
  }

  void load();
</script>

<a class="btn ghost" href={href('/catalogue')}>‹ Recettes</a>

{#if !loaded}
  <p class="muted">Chargement…</p>
{:else if !isNew && !recipe}
  <p>Recette introuvable.</p>
{:else}
  <h1 style="margin-top: 0.5rem">{isNew ? 'Nouvelle recette' : name || 'Recette'}</h1>
  {#if recipe?.archived}<p><span class="badge">Archivée</span></p>{/if}

  {#if conflict}
    <div class="banner" role="status">
      <span>La recette a changé depuis ce brouillon.</span>
      <span class="row">
        <button class="ghost" onclick={keepDraft}>Garder mon brouillon</button>
        <button onclick={discardDraft}>Abandonner</button>
      </span>
    </div>
  {:else if restoredAt}
    <div class="banner info" role="status">
      <span>Brouillon restauré (modifié {formatAgoFr(restoredAt)})</span>
      <button class="ghost" onclick={discardDraft}>Abandonner</button>
    </div>
  {/if}

  <form onsubmit={save} novalidate>
    <div class="card">
      <div class="field">
        <label for="rname">Nom</label>
        <input id="rname" bind:value={name} required autocomplete="off" />
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
                <button type="button" class="badge danger link" onclick={() => leaveWithReturn(`/aliment/${l.food.id}`)}>kcal manquant : compléter</button>
              {/if}
            </div>
            {#if l.unitReset}
              <p class="small warn-text">L'aliment n'a plus de poids unitaire : unité repassée en g, vérifiez la quantité.</p>
            {/if}
            <div class="row">
              <label class="sr-only" for="q{l.key}">Quantité de {l.food.name}</label>
              <input id="q{l.key}" class="qty" inputmode="decimal" placeholder="Quantité" bind:value={l.quantity} autocomplete="off" />
              <label class="sr-only" for="u{l.key}">Unité</label>
              <select id="u{l.key}" class="unit" bind:value={l.unit} onchange={() => (l.unitReset = false)}>
                {#each availableUnits(l.food) as u (u)}
                  <option value={u}>{unitOptionLabel(u, l.food)}</option>
                {/each}
              </select>
              <button type="button" class="ghost" aria-label="Retirer {l.food.name}" onclick={() => removeLine(l.key)}>✕</button>
            </div>
          </div>
        </div>
      {/each}
      <FoodPicker onpick={addFood} exclude={lines.map((l) => l.food.id)} oncreate={() => leaveWithReturn('/aliment/new')} />
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
        <PortionTable lines={per} />
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
                  <li>{l.food_snapshot.name} : {fmt1(l.quantity)} {unitOptionLabel(l.unit, l.food_snapshot)}</li>
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
    width: 7.5rem;
  }
  .link {
    border: 0;
    cursor: pointer;
    min-height: 0;
  }
  .warn-text {
    color: var(--warn);
    margin: 0.2rem 0;
  }
  summary {
    min-height: var(--tap);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    cursor: pointer;
  }
</style>
