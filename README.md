# RepEAT
Planifie tes repas par blocs de 100 kcal et obtiens les grammes à peser. PWA hors ligne, sans compte, pensée pour la prise de masse et la sèche.

Spécification : [SPEC.md](SPEC.md).

## Développement

Node >= 22.12 requis (Vite 8, Vitest 5). Node 24 LTS recommandé.

```sh
npm ci
npm run dev          # http://localhost:5173/RepEAT/
npm run check        # svelte-check + tsc (scripts, tests)
npm run lint
npm test
npm run build        # dist/, service worker compris
npm run preview      # sert dist/ sur http://localhost:4173/RepEAT/
```

Le chemin de base est `/RepEAT/` (GitHub Pages). Pour un autre hébergement : `BASE_PATH=/ npm run build`.

## Ciqual

`public/ciqual-2025.json` est généré et versionné. Pour le régénérer :

```sh
npm run build:ciqual
```

Le script lit les XML dans `data-src/ciqual-2025/` (non versionné, ou `CIQUAL_DIR`) et les télécharge depuis
[Recherche Data Gouv](https://doi.org/10.57745/RDMHWY) s'ils manquent.

Données : Anses. 2025. Table de composition nutritionnelle des aliments Ciqual. Licence Ouverte Etalab 2.0.

## Architecture

```
src/domain/    calculs, validation, fusion d'import, format d'export (TS pur, testé)
src/data/      Dexie et repositories : seul accès aux données depuis l'UI
src/ciqual/    format, normalisation, recherche, chargement du JSON
src/platform/  standalone iOS, stockage persistant, wake lock, partage de fichiers
src/ui/        écrans Svelte 5, routeur par hash
scripts/       prétraitement Ciqual
tests/         Vitest (+ fake-indexeddb)
```

## Déploiement

Le workflow `.github/workflows/ci.yml` vérifie, teste, construit et déploie sur GitHub Pages à chaque push sur `main`.
Prérequis, une seule fois : Settings → Pages → Source : **GitHub Actions**.
