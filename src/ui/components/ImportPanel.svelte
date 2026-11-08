<script lang="ts">
  import { repos } from '../../data';
  import { formatDateTimeFr } from '../../domain/dates';
  import { parseExport, type ExportFile } from '../../domain/exportFormat';
  import { planIsEmpty, planTotals, type MergePlan } from '../../domain/merge';
  import { attempt, errorText } from '../toast.svelte';

  // $state.raw : un Proxy Svelte ne passe pas le clonage structuré d'IndexedDB.
  let file = $state.raw<ExportFile | null>(null);
  let plan = $state.raw<MergePlan | null>(null);
  let error = $state('');
  let applying = $state(false);
  let input = $state<HTMLInputElement | null>(null);

  async function onFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    file = null;
    plan = null;
    error = '';
    if (!f) return;
    try {
      const parsed = parseExport(await f.text());
      plan = await repos().backup.preview(parsed);
      file = parsed;
    } catch (err) {
      error = errorText(err);
    }
  }

  function cancel() {
    file = null;
    plan = null;
    if (input) input.value = '';
  }

  async function apply() {
    if (!file) return;
    applying = true;
    const done = await attempt(() => repos().backup.apply(file!), 'Import terminé.');
    applying = false;
    if (done) cancel();
  }

  const totals = $derived(plan ? planTotals(plan) : null);
</script>

<div class="field">
  <label for="import-file">Importer un fichier (catalogue ou export complet)</label>
  <input id="import-file" bind:this={input} type="file" accept="application/json,.json" onchange={onFile} />
</div>

{#if error}
  <p class="errors">{error}</p>
{/if}

{#if file && plan && totals}
  <div class="card preview">
    <h3>Aperçu</h3>
    <p class="small muted">
      {file.export_type === 'catalog' ? 'Catalogue' : 'Export complet'} du {formatDateTimeFr(file.exported_at)}
      (app {file.app_version}). {file.export_type === 'catalog' ? 'Vos phases, journées et modèles ne seront pas touchés.' : ''}
    </p>
    {#if planIsEmpty(plan)}
      <p>Rien de nouveau : vos données sont déjà à jour.</p>
      <button onclick={cancel}>Fermer</button>
    {:else}
      <ul>
        <li><strong>{totals.added}</strong> élément(s) ajouté(s)</li>
        <li><strong>{totals.newVersions}</strong> nouvelle(s) version(s) de recette</li>
        <li><strong>{totals.updated}</strong> élément(s) mis à jour</li>
        <li><strong>{totals.conflicts}</strong> conflit(s) résolu(s) (la modification la plus récente l'emporte)</li>
      </ul>
      <table class="data small">
        <thead><tr><th></th><th class="r">Ajouts</th><th class="r">Mises à jour</th><th class="r">Inchangés</th></tr></thead>
        <tbody>
          {#each [['Aliments', 'foods'], ['Recettes', 'recipes'], ['Phases', 'phases'], ['Journées', 'days'], ['Modèles', 'templates']] as const as [label, k] (k)}
            {@const s = plan.stats[k]}
            {#if s.added + s.updated + s.unchanged + s.conflicts > 0}
              <tr><td>{label}</td><td class="r">{s.added}</td><td class="r">{s.updated}</td><td class="r">{s.unchanged}</td></tr>
            {/if}
          {/each}
        </tbody>
      </table>
      <div class="row" style="margin-top: 0.75rem">
        <button class="primary" disabled={applying} onclick={apply}>Appliquer l'import</button>
        <button onclick={cancel}>Annuler</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .preview {
    border-color: var(--accent);
  }
  input[type='file'] {
    padding: 0.6rem;
  }
</style>
