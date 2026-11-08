<script lang="ts">
  import { onMount } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { repos } from '../data';
  import { daysSince } from '../domain/dates';
  import { mustInstallFirst, requestPersistentStorage } from '../platform';
  import ImportPanel from './components/ImportPanel.svelte';
  import { href, route } from './router.svelte';
  import { data, editing } from './store.svelte';
  import { dismiss, toasts } from './toast.svelte';
  import Catalogue from './screens/Catalogue.svelte';
  import Day from './screens/Day.svelte';
  import FoodEdit from './screens/FoodEdit.svelte';
  import Foods from './screens/Foods.svelte';
  import History from './screens/History.svelte';
  import HistoryDay from './screens/HistoryDay.svelte';
  import InstallGate from './screens/InstallGate.svelte';
  import Phases from './screens/Phases.svelte';
  import RecipeEdit from './screens/RecipeEdit.svelte';
  import Settings from './screens/Settings.svelte';
  import Sheet from './screens/Sheet.svelte';

  const blocked = mustInstallFirst();

  const { needRefresh, updateServiceWorker } = useRegisterSW({ immediate: true });

  let empty = $state(false);
  let restoreDismissed = $state(false);
  let lastExport = $state<string | undefined>(undefined);
  let reminderDismissed = $state(false);

  onMount(async () => {
    if (blocked) return;
    // Brouillons de recette de plus de 30 jours (SPEC v1.1 §6.4) ; un échec n'est pas bloquant.
    void repos().drafts.purge().catch(() => undefined);
    const s = await repos().settings.get();
    if (s.persist_granted === undefined) {
      const granted = await requestPersistentStorage();
      if (granted !== null) await repos().settings.set({ persist_granted: granted });
    }
  });

  $effect(() => {
    void data.rev;
    if (blocked) return;
    void repos()
      .backup.isEmpty()
      .then((e) => (empty = e));
    void repos()
      .settings.get()
      .then((s) => (lastExport = s.last_full_export_at));
  });

  const needsBackup = $derived(!empty && (lastExport === undefined || daysSince(lastExport) > 7));

  const section = $derived(route.parts[0] ?? 'jour');

  const nav = [
    { id: 'jour', label: 'Jour', icon: '◐' },
    { id: 'catalogue', label: 'Recettes', icon: '▤' },
    { id: 'aliments', label: 'Aliments', icon: '◇' },
    { id: 'historique', label: 'Historique', icon: '↺' },
    { id: 'reglages', label: 'Réglages', icon: '⚙' },
  ];

  function activeNav(id: string): boolean {
    if (id === 'jour') return section === 'jour' || section === 'feuille';
    if (id === 'catalogue') return section === 'catalogue' || section === 'recette';
    if (id === 'aliments') return section === 'aliments' || section === 'aliment';
    if (id === 'reglages') return section === 'reglages' || section === 'phases';
    return section === id;
  }
</script>

{#if blocked}
  <InstallGate />
{:else}
  <main class:sheet={section === 'feuille'}>
    {#if $needRefresh}
      <div class="banner info" role="status">
        <span>Nouvelle version disponible.</span>
        <span class="row">
          <button class="ghost" onclick={() => needRefresh.set(false)}>Plus tard</button>
          <button class="primary" disabled={editing.dirty} onclick={() => updateServiceWorker(true)}>
            {editing.dirty ? 'Enregistrez d’abord' : 'Mettre à jour'}
          </button>
        </span>
      </div>
    {/if}

    {#if empty && !restoreDismissed}
      <div class="card restore">
        <h2>Bienvenue</h2>
        <p>La base est vide. Restaurez une sauvegarde (export complet) ou un catalogue partagé, ou commencez de zéro.</p>
        <ImportPanel />
        <button class="ghost" onclick={() => (restoreDismissed = true)}>Commencer sans importer</button>
      </div>
    {:else if needsBackup && !reminderDismissed && section !== 'feuille'}
      <div class="banner" role="status">
        <span>
          {lastExport ? 'Dernier export complet il y a plus de 7 jours.' : 'Aucun export complet pour l’instant.'}
        </span>
        <span class="row">
          <button class="ghost" onclick={() => (reminderDismissed = true)}>Plus tard</button>
          <a class="btn primary" href={href('/reglages')}>Sauvegarder</a>
        </span>
      </div>
    {/if}

    {#if section === 'jour'}
      <Day />
    {:else if section === 'feuille'}
      <Sheet date={route.parts[1] ?? ''} />
    {:else if section === 'catalogue'}
      <Catalogue />
    {:else if section === 'recette'}
      {#key route.parts[1]}
        <RecipeEdit id={route.parts[1] ?? 'new'} />
      {/key}
    {:else if section === 'aliments'}
      <Foods />
    {:else if section === 'aliment'}
      {#key route.parts[1]}
        <FoodEdit id={route.parts[1] ?? 'new'} />
      {/key}
    {:else if section === 'phases'}
      <Phases />
    {:else if section === 'historique' && route.parts[1]}
      <HistoryDay date={route.parts[1]} />
    {:else if section === 'historique'}
      <History />
    {:else if section === 'reglages'}
      <Settings />
    {:else}
      <p>Page introuvable. <a href={href('/jour')}>Retour au jour</a></p>
    {/if}
  </main>

  <nav aria-label="Navigation principale">
    {#each nav as n (n.id)}
      <a href={href('/' + n.id)} class:active={activeNav(n.id)} aria-current={activeNav(n.id) ? 'page' : undefined}>
        <span class="icon" aria-hidden="true">{n.icon}</span>
        <span>{n.label}</span>
      </a>
    {/each}
  </nav>
{/if}

<div class="toasts" aria-live="polite">
  {#each toasts as t (t.id)}
    <button class="toast" class:error={t.kind === 'error'} onclick={() => dismiss(t.id)}>{t.text}</button>
  {/each}
</div>

<style>
  main {
    max-width: 760px;
    margin: 0 auto;
    padding: calc(env(safe-area-inset-top, 0px) + 1rem) 1rem calc(var(--nav-h) + env(safe-area-inset-bottom, 0px) + 1.5rem);
  }
  .restore {
    border-color: var(--accent);
  }
  nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    z-index: 10;
  }
  nav a {
    flex: 1;
    min-height: var(--nav-h);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 0.72rem;
    color: var(--muted);
    text-decoration: none;
  }
  nav a .icon {
    font-size: 1.25rem;
    line-height: 1;
  }
  nav a.active {
    color: var(--accent);
    font-weight: 700;
  }
  @media (min-width: 900px) {
    nav {
      top: 0;
      bottom: 0;
      right: auto;
      width: 96px;
      flex-direction: column;
      justify-content: flex-start;
      border-top: 0;
      border-right: 1px solid var(--border);
      padding-top: 1rem;
    }
    nav a {
      flex: 0;
      min-height: 72px;
    }
    main {
      padding-bottom: 2rem;
      padding-left: calc(96px + 1.5rem);
      max-width: calc(760px + 96px);
    }
  }
  .toasts {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px) + 0.75rem);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: min(92vw, 520px);
    z-index: 20;
  }
  .toast {
    width: 100%;
    justify-content: flex-start;
    text-align: left;
    padding: 0.6rem 1rem;
    background: var(--text);
    color: var(--bg);
    border: 0;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
  }
  .toast.error {
    background: var(--danger);
    color: #fff;
  }
</style>
