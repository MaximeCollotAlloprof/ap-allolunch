# AlloLunch

Bot Google Chat qui associe aleatoirement des employes (2 a 4 personnes) selon leurs
centres d'interet pour diner ensemble et briser les silos. Cycle hebdomadaire automatique,
invitation Google Calendar creee automatiquement pour chaque groupe matche.

## Decisions produit (MVP)

- **Groupes**: taille variable, 2 a 4 personnes par match.
- **Cycle**: automatique, hebdomadaire (declenche par Cloud Scheduler).
- **Anti-repetition**: un employe ne doit pas etre reMatche avec quelqu'un qu'il a deja
  cotoye dans les `MATCH_HISTORY_WINDOW_CYCLES` derniers cycles (voir `matchHistoryRepository`).
- **Participants restants (nombre impair)**: reportes au cycle suivant, pas de groupe forme
  en violation de l'anti-repetition.
- **Non-reponse/refus d'un match**: aucune penalite ni scoring de fiabilite, un simple rappel
  automatique suffit.
- **Participation**: opt-in volontaire via le bot (pas d'inscription automatique).
- **Gestion de la participation**: commandes texte dans le bot Chat (`/rejoindre`, `/pause`, ...).
- **Disponibilites**: saisie manuelle par l'employe dans le bot (pas de lecture du Calendar).
- **Centres d'interet**: liste fermee de tags predefinis (`InterestTag` dans `src/domain/types.ts`),
  pas de texte libre - le matching reste deterministe et testable.
- **Calendar**: creation d'evenement via un service account avec delegation domain-wide
  (pas d'OAuth par employe).
- **Pas de dashboard admin** pour le MVP - les metriques se tirent directement de Firestore
  au besoin.
- **Langue**: francais uniquement pour le MVP.

## Architecture

- **Stack**: Node.js 20 / TypeScript, Express (API HTTP), deploye sur Cloud Run.
- **Donnees**: Firestore (`employees`, `matchCycles`, `matchGroups`).
- **Orchestration du cycle**: Cloud Scheduler appelle `POST /scheduler/trigger-cycle` chaque
  semaine. Ce endpoint protege par l'en-tete OIDC de Cloud Scheduler en production.
- **Secrets**: Secret Manager (cle du service account pour la delegation domain-wide Calendar).
  Aucun secret ni fichier de credentials ne doit etre commit dans ce repo.
- Ce repo est independant de `ap-helm-charts`/`ap-k8s-*` (pas de deploiement Helm) et de
  `ap-functions` (pas de Firebase Functions) - deploiement Cloud Run autonome.

## Structure du code

```
src/
  domain/          Types partages (EmployeeProfile, MatchGroup, InterestTag, ...)
  matching/         Moteur de matching pur (aucune I/O), voir engine.ts + test/matching/engine.test.ts
  chat/            Webhook + commandes du bot Google Chat (lot 1)
  calendar/        Integration Google Calendar (lot 3)
  db/              Client Firestore + repositories (lot 2)
  scheduler/       Endpoint declenche par Cloud Scheduler, orchestre un cycle complet
  config/          Chargement/validation des variables d'environnement (fail fast)
```

## Repartition de l'equipe (3 lots verticaux)

Voir [docs/tickets.md](docs/tickets.md) pour le detail. Chaque lot possede des points
d'integration clairs (interfaces/types deja definis) pour permettre un developpement parallele:

1. **Bot Google Chat + questionnaire** (`src/chat/`)
2. **Moteur de matching + Firestore** (`src/matching/`, `src/db/`)
3. **Integration Calendar + infra/deploiement** (`src/calendar/`, `Dockerfile`, CI/CD, Cloud Run/Scheduler/Secret Manager)

## Conventions de developpement

- Une branche par personne/tache (`feat/<sujet>`), jamais de travail direct sur `main`.
- PR obligatoire avant merge sur `main`, revue par au moins un autre membre de l'equipe.
- Le moteur de matching (`src/matching/engine.ts`) reste une fonction pure, sans I/O -
  toute nouvelle regle de matching doit rester testable unitairement (voir `test/matching/`).
- Toute variable d'environnement necessaire doit etre ajoutee a `src/config/env.ts` (zod)
  et documentee dans `.env.example`.
- Pas de secret/credentials dans le repo - passer par Secret Manager en production et un
  fichier `.env` local (ignore par git) en developpement.
- `npm run lint`, `npm run typecheck` et `npm test` doivent passer avant toute PR (verifie
  automatiquement par la CI GitHub Actions).

## Commandes utiles

```bash
npm install
npm run dev          # serveur local avec rechargement
npm test             # tests unitaires (vitest)
npm run lint          # ESLint
npm run format        # Prettier (ecrit les corrections)
npm run typecheck      # tsc --noEmit
npm run build          # compilation TypeScript -> dist/
```
