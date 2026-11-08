<script lang="ts">
  // Écran bloquant : Safari iOS hors mode écran d'accueil.
</script>

<div class="gate">
  <img src="./apple-touch-icon.png" alt="" width="96" height="96" />
  <h1>Installez RepEAT</h1>
  <p>
    Sur iPhone, l'app doit être ajoutée à l'écran d'accueil : les données de Safari ne sont pas partagées avec l'app
    installée, elles seraient perdues.
  </p>
  <ol>
    <li>Touchez le bouton <strong>Partager</strong> <span aria-hidden="true">(carré avec une flèche)</span> en bas de Safari.</li>
    <li>Choisissez <strong>Sur l'écran d'accueil</strong>.</li>
    <li>Touchez <strong>Ajouter</strong>, puis ouvrez RepEAT depuis son icône.</li>
  </ol>
  <p class="muted small">Après la première ouverture, l'app fonctionne entièrement hors ligne.</p>
</div>

<style>
  .gate {
    max-width: 480px;
    margin: 0 auto;
    padding: calc(env(safe-area-inset-top, 0px) + 2rem) 1.25rem 2rem;
    text-align: center;
  }
  img {
    border-radius: 22px;
    margin-bottom: 1rem;
  }
  ol {
    text-align: left;
    padding-left: 1.25rem;
    line-height: 1.7;
  }
</style>
