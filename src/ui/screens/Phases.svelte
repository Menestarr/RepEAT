<script lang="ts">
  import { repos } from '../../data';
  import { formatDateFr, todayLocal } from '../../domain/dates';
  import { fmtBlocks, fmtInt, parseNumber } from '../../domain/format';
  import type { Phase } from '../../domain/types';
  import { validateKcalTarget } from '../../domain/validation';
  import { activePhase } from '../../domain/versions';
  import { href } from '../router.svelte';
  import { data } from '../store.svelte';
  import { attempt } from '../toast.svelte';

  let phases = $state<Phase[]>([]);
  let editingId = $state<string | null>(null);
  let form = $state({ name: '', target: '', start: todayLocal() });
  let tried = $state(false);
  let confirmDelete = $state<string | null>(null);

  $effect(() => {
    void data.rev;
    void repos()
      .phases.list()
      .then((p) => (phases = p));
  });

  const active = $derived(activePhase(phases, todayLocal()));
  const target = $derived(parseNumber(form.target));
  const errors = $derived(
    [
      !form.name.trim() ? 'Le nom est requis.' : null,
      target === null ? 'La cible est requise.' : validateKcalTarget(target),
      !form.start ? 'La date de début est requise.' : null,
    ].filter((e): e is string => !!e),
  );

  function edit(p: Phase) {
    editingId = p.id;
    form = { name: p.name, target: String(p.kcal_target), start: p.start_date };
    tried = false;
  }

  function reset() {
    editingId = null;
    form = { name: '', target: '', start: todayLocal() };
    tried = false;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    tried = true;
    if (errors.length || target === null) return;
    const payload = { name: form.name, kcal_target: target, start_date: form.start };
    const id = editingId;
    const ok = id
      ? await attempt(() => repos().phases.update(id, payload), 'Phase modifiée.')
      : await attempt(() => repos().phases.create(payload), 'Phase créée.');
    if (ok) reset();
  }

  async function remove(id: string) {
    confirmDelete = null;
    await attempt(() => repos().phases.remove(id), 'Phase supprimée.');
    if (editingId === id) reset();
  }
</script>

<a class="btn ghost" href={href('/reglages')}>‹ Réglages</a>
<h1 style="margin-top: 0.5rem">Phases</h1>
<p class="small muted">
  La phase active à une date est la plus récente commencée à cette date. Les journées en brouillon suivent la phase ; les
  journées validées gardent leur cible.
</p>

<form class="card" onsubmit={submit} novalidate>
  <h2>{editingId ? 'Modifier la phase' : 'Nouvelle phase'}</h2>
  <div class="field">
    <label for="pname">Nom</label>
    <input id="pname" bind:value={form.name} placeholder="Sèche, maintien…" />
  </div>
  <div class="grid2">
    <div class="field">
      <label for="ptarget">Cible (kcal, multiple de 50)</label>
      <input id="ptarget" inputmode="numeric" bind:value={form.target} placeholder="1900" />
    </div>
    <div class="field">
      <label for="pstart">Début</label>
      <input id="pstart" type="date" bind:value={form.start} />
    </div>
  </div>
  {#if target !== null && !validateKcalTarget(target)}
    <p class="small muted">Soit {fmtBlocks(target / 100)} blocs par jour.</p>
  {/if}
  {#if tried && errors.length}
    <ul class="errors">
      {#each errors as e (e)}<li>{e}</li>{/each}
    </ul>
  {/if}
  <div class="row">
    <button class="primary" type="submit">{editingId ? 'Enregistrer' : 'Créer'}</button>
    {#if editingId}<button type="button" onclick={reset}>Annuler</button>{/if}
  </div>
</form>

{#if phases.length > 0}
  <ul class="list card">
    {#each phases as p (p.id)}
      <li>
        <div class="grow">
          <div>
            {p.name}
            {#if active?.id === p.id}<span class="badge ok">Active</span>{/if}
          </div>
          <div class="small muted num">{fmtInt(p.kcal_target)} kcal · depuis le {formatDateFr(p.start_date)}</div>
        </div>
        {#if confirmDelete === p.id}
          <button class="danger" onclick={() => remove(p.id)}>Confirmer</button>
          <button class="ghost" onclick={() => (confirmDelete = null)}>Non</button>
        {:else}
          <button class="ghost" onclick={() => edit(p)}>Modifier</button>
          <button class="ghost" aria-label="Supprimer {p.name}" onclick={() => (confirmDelete = p.id)}>✕</button>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  ul.card {
    padding: 0 1rem;
  }
</style>
