<script lang="ts">
  import { repos } from '../../data';
  import { CIQUAL_ATTRIBUTION, CIQUAL_DOI, CIQUAL_LICENSE } from '../../ciqual/format';
  import { formatDateTimeFr, nowIso } from '../../domain/dates';
  import { exportFileName, type ExportType } from '../../domain/exportFormat';
  import { fmtBlocks } from '../../domain/format';
  import type { Settings, Template } from '../../domain/types';
  import { isStandalone, isStoragePersisted, requestPersistentStorage, shareOrDownload } from '../../platform';
  import ImportPanel from '../components/ImportPanel.svelte';
  import { href } from '../router.svelte';
  import { data } from '../store.svelte';
  import { attempt, notify } from '../toast.svelte';

  let settings = $state<Settings | null>(null);
  let persisted = $state<boolean | null>(null);
  let templates = $state<Template[]>([]);
  let exporting = $state(false);

  $effect(() => {
    void data.rev;
    void repos()
      .settings.get()
      .then((s) => (settings = s));
    void repos()
      .templates.list()
      .then((t) => (templates = t));
    void isStoragePersisted().then((p) => (persisted = p));
  });

  async function doExport(type: ExportType) {
    exporting = true;
    try {
      const file = await attempt(() => repos().backup.exportData(type));
      if (!file) return;
      const result = await shareOrDownload(exportFileName(type, file.exported_at), JSON.stringify(file, null, 1));
      if (result === 'cancelled') return;
      if (type === 'full') await attempt(() => repos().settings.set({ last_full_export_at: nowIso() }));
      notify(result === 'shared' ? 'Export partagé.' : 'Export téléchargé.');
    } finally {
      exporting = false;
    }
  }

  async function askPersist() {
    const p = await requestPersistentStorage();
    persisted = p;
    if (p !== null) await attempt(() => repos().settings.set({ persist_granted: p }));
    if (!p) notify('Le navigateur a refusé le stockage persistant.', 'error');
  }

  async function removeTemplate(id: string) {
    await attempt(() => repos().templates.remove(id), 'Modèle supprimé.');
  }
</script>

<h1>Réglages</h1>

<section class="card">
  <h2>Cible</h2>
  <a class="btn" href={href('/phases')}>Gérer les phases</a>
</section>

<section class="card">
  <h2>Sauvegarde et partage</h2>
  <p class="small muted">
    Dernier export complet : {settings?.last_full_export_at ? formatDateTimeFr(settings.last_full_export_at) : 'jamais'}.
  </p>
  <div class="row wrap">
    <button class="primary" disabled={exporting} onclick={() => doExport('full')}>Export complet</button>
    <button disabled={exporting} onclick={() => doExport('catalog')}>Exporter le catalogue</button>
  </div>
  <p class="small muted" style="margin-top: 0.5rem">
    Le catalogue (aliments, recettes) se partage sans données personnelles. L'export complet sert de sauvegarde : rangez-le
    dans Fichiers ou Google Drive.
  </p>
  <hr />
  <ImportPanel />
</section>

{#if templates.length > 0}
  <section class="card">
    <h2>Modèles de journée</h2>
    <ul class="list">
      {#each templates as t (t.id)}
        <li>
          <span class="grow">
            {t.name}
            <span class="small muted num">· {fmtBlocks(t.entries.reduce((s, e) => s + e.blocks, 0))} blocs</span>
          </span>
          <button class="ghost" aria-label="Supprimer le modèle {t.name}" onclick={() => removeTemplate(t.id)}>✕</button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<section class="card">
  <h2>Stockage</h2>
  <p>
    Stockage persistant :
    {#if persisted === true}<span class="badge ok">accordé</span>
    {:else if persisted === false}<span class="badge warn">non accordé</span>
    {:else}<span class="badge">non disponible</span>{/if}
  </p>
  {#if persisted === false}
    <button onclick={askPersist}>Demander à nouveau</button>
  {/if}
  <p class="small muted">
    Mode : {isStandalone() ? 'app installée' : 'navigateur'}. Les données restent sur cet appareil ; faites des exports
    complets réguliers.
  </p>
</section>

<section class="card">
  <h2>À propos</h2>
  <p>RepEAT {__APP_VERSION__}. Fonctionne hors ligne, sans compte ni serveur.</p>
  <p class="small">
    Données nutritionnelles : {CIQUAL_ATTRIBUTION}. <a href={CIQUAL_DOI} target="_blank" rel="noopener">{CIQUAL_DOI}</a>.
    {CIQUAL_LICENSE}.
  </p>
</section>

<style>
  hr {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 1rem 0;
  }
</style>
