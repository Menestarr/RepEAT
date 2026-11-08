<script lang="ts">
  import { repos } from '../../data';
  import { daySummary, versionTotals } from '../../domain/calc';
  import { addDays, formatDateFr, isIsoDate, todayLocal } from '../../domain/dates';
  import { DEFAULT_ADD_KCAL, fillRemaining, type KcalInput } from '../../domain/dayInput';
  import { fmtBlocks, fmtInt, fmtSigned } from '../../domain/format';
  import { normalize } from '../../ciqual/format';
  import {
    CATEGORIES,
    type Day,
    type DayEntry,
    type Phase,
    type Recipe,
    type RecipeVersion,
    type Template,
  } from '../../domain/types';
  import { activePhase } from '../../domain/versions';
  import { go, href, route } from '../router.svelte';
  import { data } from '../store.svelte';
  import KcalField from '../components/KcalField.svelte';
  import { attempt, notify } from '../toast.svelte';

  const date = $derived.by(() => {
    const q = route.query.get('date');
    return q && isIsoDate(q) ? q : todayLocal();
  });

  let loaded = $state(false);
  let phases = $state<Phase[]>([]);
  let day = $state<Day | undefined>(undefined);
  let yesterday = $state<Day | undefined>(undefined);
  let recipes = $state<Recipe[]>([]);
  let currents = $state(new Map<string, RecipeVersion>());
  let dayVersions = $state(new Map<string, RecipeVersion>());
  let templates = $state<Template[]>([]);
  let query = $state('');
  let templateId = $state('');
  let templateName = $state('');
  let showTemplateForm = $state(false);
  let busy = $state(false);

  $effect(() => {
    void data.rev;
    void load(date);
  });

  async function load(d: string) {
    const r = repos();
    const [ph, dd, yd, rs, cur, tpl] = await Promise.all([
      r.phases.list(),
      r.days.getByDate(d),
      r.days.getByDate(addDays(d, -1)),
      r.recipes.list({ includeArchived: true }),
      r.recipes.currents(),
      r.templates.list(),
    ]);
    const versions = dd ? await r.recipes.getVersions(dd.entries.map((e) => e.recipe_version_id)) : new Map();
    if (d !== date) return; // la date a changé pendant le chargement
    phases = ph;
    day = dd;
    yesterday = yd;
    recipes = rs;
    currents = cur;
    dayVersions = versions;
    templates = tpl;
    loaded = true;
    // Cible recalculée tant que la journée est en brouillon.
    const p = activePhase(ph, d);
    if (dd && dd.status === 'draft' && p && dd.kcal_target_snapshot !== p.kcal_target) {
      await attempt(() => r.days.update(dd.id, { kcal_target_snapshot: p.kcal_target }));
    }
  }

  const phase = $derived(activePhase(phases, date));
  const readOnly = $derived(day?.status === 'validated');
  const recipeById = $derived(new Map(recipes.map((r) => [r.id, r])));

  const items = $derived(
    (day?.entries ?? []).flatMap((e) => {
      const v = dayVersions.get(e.recipe_version_id);
      return v ? [{ entry: e, version: v, recipe: recipeById.get(v.recipe_id) }] : [];
    }),
  );

  const summary = $derived(
    daySummary(
      items.map((i) => ({ version: i.version, blocks: i.entry.blocks })),
      day?.kcal_target_snapshot ?? phase?.kcal_target ?? 0,
    ),
  );

  const blocksByRecipe = $derived.by(() => {
    const m: Record<string, number> = {};
    for (const i of items) m[i.version.recipe_id] = (m[i.version.recipe_id] ?? 0) + i.entry.blocks;
    return m;
  });

  const groups = $derived.by(() => {
    const q = normalize(query);
    const tokens = q.split(' ').filter(Boolean);
    const visible = recipes.filter(
      (r) => !r.archived && currents.has(r.id) && tokens.every((t) => normalize(r.name).includes(t)),
    );
    return CATEGORIES.map((c) => ({ ...c, recipes: visible.filter((r) => r.category === c.id) })).filter(
      (g) => g.recipes.length > 0,
    );
  });

  function outdated(v: RecipeVersion): boolean {
    const cur = currents.get(v.recipe_id);
    return !!cur && cur.id !== v.id;
  }

  async function saveEntries(entries: DayEntry[]) {
    if (busy) return;
    busy = true;
    try {
      const r = repos();
      const target = phase?.kcal_target;
      const current = day;
      let saved: Day | undefined;
      if (!current) {
        if (target === undefined) return;
        saved = await attempt(() => r.days.create(date, target, entries));
      } else {
        saved = await attempt(() => r.days.update(current.id, { entries }));
      }
      // Appliqué tout de suite : un second tap ne repart pas d'entrées périmées.
      if (saved) day = saved;
    } finally {
      busy = false;
    }
  }

  /**
   * Fixe les blocs d'une recette dans la journée : `next` reçoit les blocs actuels
   * (0 si absente) et renvoie la nouvelle valeur ; ≤ 0 retire la recette.
   * Une recette absente est ajoutée dans sa version courante.
   */
  function updateBlocks(recipeId: string, next: (current: number) => number) {
    const entries = [...(day?.entries ?? [])].map((e) => ({ ...e }));
    const idx = entries.findIndex((e) => dayVersions.get(e.recipe_version_id)?.recipe_id === recipeId);
    const n = Math.round(next(idx >= 0 ? entries[idx]!.blocks : 0) * 2) / 2;
    if (idx >= 0) {
      if (n <= 0) entries.splice(idx, 1);
      else entries[idx]!.blocks = n;
    } else {
      const cur = currents.get(recipeId);
      if (n <= 0 || !cur) return;
      entries.push({ recipe_version_id: cur.id, blocks: n });
      dayVersions = new Map([...dayVersions, [cur.id, cur]]);
    }
    void saveEntries(entries);
  }

  /** Boutons − / + : pas d'un demi-bloc (50 kcal). */
  function changeBlocks(recipeId: string, delta: number) {
    updateBlocks(recipeId, (b) => b + delta);
  }

  /** Saisie directe des kcal (KcalField) ; l'arrondi au demi-bloc est signalé. */
  function commitKcal(recipeId: string, input: Exclude<KcalInput, { kind: 'invalid' }>) {
    if (input.kind === 'remove') return updateBlocks(recipeId, () => 0);
    if (input.adjusted) notify(`Arrondi à ${fmtInt(input.blocks * 100)} kcal.`);
    updateBlocks(recipeId, () => input.blocks);
  }

  /** « = reste » : la recette absorbe le reste du jour, au demi-bloc inférieur. */
  function fillWithRemaining(recipeId: string) {
    updateBlocks(recipeId, (b) => fillRemaining(b, summary.remaining_kcal) ?? b);
  }

  /** Pas de bascule silencieuse : l'utilisateur choisit de passer à la version courante. */
  function updateVersion(entry: DayEntry) {
    const v = dayVersions.get(entry.recipe_version_id);
    const cur = v && currents.get(v.recipe_id);
    if (!cur) return;
    dayVersions = new Map([...dayVersions, [cur.id, cur]]);
    const entries: DayEntry[] = [];
    for (const e of day?.entries ?? []) {
      if (e === entry || e.recipe_version_id === cur.id) {
        const existing = entries.find((x) => x.recipe_version_id === cur.id);
        if (existing) existing.blocks += e.blocks;
        else entries.push({ recipe_version_id: cur.id, blocks: e.blocks });
      } else entries.push({ ...e });
    }
    void saveEntries(entries);
  }

  function entriesFromRecipes(list: { recipe_id: string; blocks: number }[]): DayEntry[] {
    const out: DayEntry[] = [];
    for (const x of list) {
      const cur = currents.get(x.recipe_id);
      const rec = recipeById.get(x.recipe_id);
      if (!cur || !rec || rec.deleted_at) continue;
      const existing = out.find((e) => e.recipe_version_id === cur.id);
      if (existing) existing.blocks += x.blocks;
      else out.push({ recipe_version_id: cur.id, blocks: x.blocks });
    }
    return out;
  }

  async function startFromYesterday() {
    if (!yesterday) return;
    const versions = await repos().recipes.getVersions(yesterday.entries.map((e) => e.recipe_version_id));
    dayVersions = new Map([...dayVersions, ...[...currents.values()].map((v) => [v.id, v] as [string, RecipeVersion])]);
    const list = yesterday.entries.flatMap((e) => {
      const v = versions.get(e.recipe_version_id);
      return v ? [{ recipe_id: v.recipe_id, blocks: e.blocks }] : [];
    });
    await saveEntries(entriesFromRecipes(list));
  }

  async function startFromTemplate() {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    dayVersions = new Map([...dayVersions, ...[...currents.values()].map((v) => [v.id, v] as [string, RecipeVersion])]);
    await saveEntries(entriesFromRecipes(t.entries));
  }

  async function setStatus(status: Day['status']) {
    if (day) await attempt(() => repos().days.update(day!.id, { status }), status === 'validated' ? 'Journée validée.' : 'Journée rouverte.');
  }

  async function resetDay() {
    if (day) await attempt(() => repos().days.remove(day!.id), 'Journée réinitialisée.');
  }

  async function saveTemplate(e: SubmitEvent) {
    e.preventDefault();
    const entries = items.map((i) => ({ recipe_id: i.version.recipe_id, blocks: i.entry.blocks }));
    const ok = await attempt(() => repos().templates.create(templateName, entries), 'Modèle enregistré.');
    if (ok) {
      templateName = '';
      showTemplateForm = false;
    }
  }

  function goDate(d: string) {
    go(d === todayLocal() ? '/jour' : `/jour?date=${d}`);
  }

  function recipeKcalPerBlockInfo(v: RecipeVersion): string {
    return `${fmtBlocks(Math.round((versionTotals(v).kcal / 100) * 10) / 10)} blocs la recette`;
  }
</script>

<header class="spread datebar">
  <button class="round ghost" aria-label="Jour précédent" onclick={() => goDate(addDays(date, -1))}>‹</button>
  <div class="grow center">
    <h1>{formatDateFr(date)}</h1>
    {#if date !== todayLocal()}
      <button class="ghost small" onclick={() => goDate(todayLocal())}>Revenir à aujourd'hui</button>
    {/if}
  </div>
  <button class="round ghost" aria-label="Jour suivant" onclick={() => goDate(addDays(date, 1))}>›</button>
</header>

{#if !loaded}
  <p class="muted">Chargement…</p>
{:else if !phase && !day}
  <div class="card">
    <h2>Aucune phase définie</h2>
    <p>Créez une phase (cible calorique datée) pour composer vos journées.</p>
    <a class="btn primary" href={href('/phases')}>Créer une phase</a>
  </div>
{:else}
  <section class="counter" class:done={summary.done} class:over={summary.remaining_kcal < 0} aria-live="polite">
    <div>
      <span class="label">Cible</span>
      <strong class="num">{fmtBlocks(summary.target_blocks)}</strong>
      <span class="kcal num">{fmtInt(summary.target_kcal)} kcal</span>
    </div>
    <div>
      <span class="label">Total</span>
      <strong class="num">{fmtBlocks(summary.total_blocks)}</strong>
      <span class="kcal num">{fmtInt(summary.total_kcal)} kcal</span>
    </div>
    <div class="rest">
      <span class="label">Reste</span>
      <strong class="num">{fmtBlocks(summary.remaining_blocks)}</strong>
      <span class="kcal num">{fmtInt(summary.remaining_kcal)} kcal</span>
    </div>
  </section>
  {#if Math.round(summary.delta_kcal) !== 0}
    <!-- Informatif : le reste en blocs n'en tient pas compte (SPEC v1.1 §5.3). -->
    <p class="small muted center rounding num">Arrondis : {fmtSigned(summary.delta_kcal)} kcal</p>
  {/if}
  <p class="small muted center macros num">
    P {fmtInt(summary.macros.prot)} g · G {fmtInt(summary.macros.carb)} g · L {fmtInt(summary.macros.fat)} g

    {#if phase}<br />{phase.name}{/if}
  </p>

  {#if !day}
    <div class="card">
      <h2>Démarrer la journée</h2>
      <div class="row wrap">
        <button onclick={() => saveEntries([])}>Vide</button>
        <button disabled={!yesterday || yesterday.entries.length === 0} onclick={startFromYesterday}>Comme la veille</button>
      </div>
      {#if templates.length > 0}
        <div class="row" style="margin-top: 0.75rem">
          <label class="sr-only" for="tpl">Modèle</label>
          <select id="tpl" bind:value={templateId}>
            <option value="">Choisir un modèle…</option>
            {#each templates as t (t.id)}
              <option value={t.id}>{t.name}</option>
            {/each}
          </select>
          <button disabled={!templateId} onclick={startFromTemplate}>Appliquer</button>
        </div>
      {/if}
      <p class="small muted" style="margin-top: 0.75rem">Ou ajoutez directement une recette ci-dessous.</p>
    </div>
  {/if}

  {#if items.length > 0}
    <section class="card">
      <div class="spread">
        <h2>Au menu</h2>
        <span class="badge" class:ok={readOnly}>{readOnly ? 'Validée' : 'Brouillon'}</span>
      </div>
      <ul class="list">
        {#each items as i (i.entry.recipe_version_id)}
          {@const rid = i.version.recipe_id}
          {@const name = i.recipe?.name ?? 'Recette supprimée'}
          {@const fill = fillRemaining(i.entry.blocks, summary.remaining_kcal)}
          <li>
            <div class="grow">
              <div>{name}</div>
              {#if !readOnly && fill !== null}
                <button class="small fill" disabled={busy} onclick={() => fillWithRemaining(rid)} aria-label="Compléter {name} avec le reste ({fmtInt(fill * 100)} kcal)">= reste</button>
              {/if}
              {#if !readOnly && outdated(i.version)}
                <button class="small update" onclick={() => updateVersion(i.entry)}>Nouvelle version : mettre à jour</button>
              {/if}
            </div>
            {#if readOnly}
              <div class="ro num">
                <strong>{fmtInt(i.entry.blocks * 100)} kcal</strong>
                <span class="small muted">{fmtBlocks(i.entry.blocks)} blocs</span>
              </div>
            {:else}
              <button class="round" aria-label="Retirer un demi-bloc" disabled={busy} onclick={() => changeBlocks(rid, -0.5)}>−</button>
              <KcalField blocks={i.entry.blocks} label="kcal de {name}" disabled={busy} oncommit={(r) => commitKcal(rid, r)} />
              <button class="round" aria-label="Ajouter un demi-bloc" disabled={busy} onclick={() => changeBlocks(rid, 0.5)}>+</button>
            {/if}
          </li>
        {/each}
      </ul>
      <div class="row wrap actions">
        <a class="btn primary" href={href(`/feuille/${date}`)}>Feuille du jour</a>
        {#if readOnly}
          <button onclick={() => setStatus('draft')}>Rouvrir</button>
        {:else}
          <button onclick={() => setStatus('validated')}>Valider</button>
        {/if}
        <button onclick={() => (showTemplateForm = !showTemplateForm)}>Enregistrer comme modèle</button>
      </div>
      {#if showTemplateForm}
        <form class="row" onsubmit={saveTemplate} style="margin-top: 0.75rem">
          <label class="sr-only" for="tplname">Nom du modèle</label>
          <input id="tplname" placeholder="Nom du modèle" bind:value={templateName} required autocomplete="off" />
          <button class="primary" type="submit">OK</button>
        </form>
      {/if}
    </section>
  {:else if day}
    <div class="row wrap" style="margin-bottom: 1rem">
      <span class="muted grow">Journée vide.</span>
      <button class="ghost small" onclick={resetDay}>Recommencer (vide, veille, modèle)</button>
    </div>
  {/if}

  {#if !readOnly}
    <section>
      <div class="field">
        <label for="q">Ajouter une recette</label>
        <input id="q" type="search" placeholder="Rechercher par nom" bind:value={query} autocomplete="off" autocorrect="off" spellcheck="false" />
      </div>
      {#if groups.length === 0}
        <p class="muted">
          {recipes.length === 0 ? 'Aucune recette.' : 'Aucune recette ne correspond.'}
          <a href={href('/recette/new')}>Créer une recette</a>
        </p>
      {/if}
      {#each groups as g (g.id)}
        <h3 class="cat">{g.label}</h3>
        <ul class="list card tight">
          {#each g.recipes as r (r.id)}
            {@const n = blocksByRecipe[r.id] ?? 0}
            {@const cur = currents.get(r.id)}
            {@const canAdd = !!phase || !!day}
            <li>
              <div class="grow">
                <div>{r.name}</div>
                {#if cur}<div class="small muted">{recipeKcalPerBlockInfo(cur)}</div>{/if}
              </div>
              <button class="round" aria-label="Retirer un demi-bloc de {r.name}" disabled={n === 0 || busy} onclick={() => changeBlocks(r.id, -0.5)}>−</button>
              <KcalField blocks={n} suggested={DEFAULT_ADD_KCAL} label="kcal de {r.name}" disabled={busy || !canAdd} oncommit={(x) => commitKcal(r.id, x)} />
              <button class="round" aria-label="Ajouter un demi-bloc de {r.name}" disabled={busy || !canAdd} onclick={() => changeBlocks(r.id, 0.5)}>+</button>
            </li>
          {/each}
        </ul>
      {/each}
    </section>
  {/if}
{/if}

<style>
  .datebar h1 {
    font-size: 1.05rem;
    text-align: center;
    margin: 0;
    text-transform: capitalize;
  }
  .center {
    text-align: center;
  }
  .counter {
    position: sticky;
    top: env(safe-area-inset-top, 0px);
    z-index: 5;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.6rem;
    margin: 0.75rem 0 0.35rem;
    text-align: center;
  }
  .counter > div {
    display: flex;
    flex-direction: column;
  }
  .counter .label {
    font-size: 0.75rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .counter strong {
    font-size: 1.6rem;
    line-height: 1.1;
  }
  .counter .kcal {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .counter.done {
    background: var(--ok-soft);
    border-color: var(--ok);
  }
  .counter.done .rest strong {
    color: var(--ok);
  }
  .counter.over .rest strong {
    color: var(--danger);
  }
  .macros {
    margin-bottom: 1rem;
  }
  .rounding {
    margin: 0 0 0.35rem;
  }
  .ro {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .fill {
    margin-top: 0.25rem;
    min-height: 36px;
  }
  .cat {
    margin: 1rem 0 0.4rem;
    color: var(--muted);
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .tight {
    padding: 0 0.75rem;
  }
  .actions {
    margin-top: 0.75rem;
  }
  .update {
    margin-top: 0.25rem;
    min-height: 36px;
    border-color: var(--warn);
    color: var(--warn);
    background: var(--warn-soft);
  }
</style>
