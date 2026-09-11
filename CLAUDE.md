# AlloLunch

Bot Google Chat qui associe aleatoirement des employes (3 a 5 personnes) selon leurs
centres d'interet pour diner ensemble et briser les silos. Cycle hebdomadaire automatique:
chaque lundi, Gemini genere un nouveau questionnaire et les profils sont remis a zero;
chaque vendredi 9h, le matching tourne et cree les notifications Chat + invitations
Google Calendar.

## Decisions produit (MVP)

- **Groupes**: taille variable, 3 a 5 personnes par match.
- **Cycle hebdomadaire IA**: chaque lundi, un agent Gemini genere une nouvelle question a
  choix multiples par categorie de centre d'interet (`POST /scheduler/weekly-reset`) et les
  centres d'interet/disponibilites de tous les employes sont effaces. Le meme jeu de
  questions est partage par tout le monde cette semaine-la (genere une seule fois), pour
  que le matching reste fiable. Si Gemini echoue: aucun fallback automatique, l'app annonce
  simplement une semaine sans AlloLunch.
- **Matching hebdomadaire**: `POST /scheduler/trigger-cycle` tourne chaque vendredi 9h
  (fuseau horaire explicite cote Cloud Scheduler - ex: America/Toronto).
- **Anti-repetition**: un employe ne doit pas etre reMatche avec quelqu'un qu'il a deja
  cotoye dans les `MATCH_HISTORY_WINDOW_CYCLES` derniers cycles (voir `matchHistoryRepository`) -
  cet historique n'est PAS efface par le reset hebdomadaire.
- **Participants restants (nombre impair)**: reportes au cycle suivant, pas de groupe forme
  en violation de l'anti-repetition.
- **Non-reponse/refus d'un match**: aucune penalite ni scoring de fiabilite, un simple rappel
  automatique suffit.
- **Participation**: opt-in **hebdomadaire obligatoire** via `/rejoindre` - qui ne le retape
  pas apres le reset du lundi est exclu du cycle de la semaine.
- **Gestion de la participation**: commandes texte dans le bot Chat (`/rejoindre`, `/pause`, ...).
- **Disponibilites**: redemandees chaque semaine juste apres `/rejoindre` (premiere question
  posee, avant les centres d'interet) - saisie manuelle, pas de lecture du Calendar.
- **Centres d'interet**: les 12 categories restent une liste fermee (`InterestCategory` dans
  `src/domain/types.ts`), mais les questions/reponses precises de chaque categorie sont
  generees par Gemini chaque semaine (`EmployeeProfile.interestAnswers: string[]`,
  format `${category}:${optionId}`) - retardataires matches quand meme sur ce qu'ils ont
  rempli.
- **Calendar**: creation d'evenement via un service account avec delegation domain-wide
  (pas d'OAuth par employe).
- **Pas de dashboard admin** pour le MVP - les metriques se tirent directement de Firestore
  au besoin.
- **Langue**: francais uniquement pour le MVP.

## Architecture

- **Stack**: Node.js 20 / TypeScript, Express (API HTTP), deploye sur Cloud Run.
- **Donnees**: Firestore (`employees`, `matchCycles`, `matchGroups`, `weeklyQuestionSets`).
- **Orchestration hebdomadaire**: deux jobs Cloud Scheduler distincts, fuseau horaire
  explicite - `POST /scheduler/weekly-reset` (lundi matin: generation Gemini + reset des
  profils) et `POST /scheduler/trigger-cycle` (vendredi 9h: matching + notifications +
  Calendar). Tous deux proteges par l'en-tete OIDC de Cloud Scheduler en production.
- **IA**: API Gemini (`@google/genai`, cle API Google AI Studio - `GEMINI_API_KEY`) pour
  generer les questions hebdomadaires (`src/ai/geminiQuestionGenerator.ts`). Sortie validee
  par un schema `zod` - aucune reparation automatique en cas de format invalide.
- **Secrets**: Secret Manager (cle du service account pour la delegation domain-wide
  Calendar, cle API Gemini). Aucun secret ni fichier de credentials ne doit etre commit
  dans ce repo.
- Ce repo est independant de `ap-helm-charts`/`ap-k8s-*` (pas de deploiement Helm) et de
  `ap-functions` (pas de Firebase Functions) - deploiement Cloud Run autonome.

## Structure du code

```
src/
  domain/          Types partages (EmployeeProfile, MatchGroup, InterestCategory, WeeklyQuestion, ...)
  matching/         Moteur de matching pur (aucune I/O), voir engine.ts + test/matching/engine.test.ts
  chat/            Webhook + commandes du bot Google Chat (lot 1)
  calendar/        Integration Google Calendar (lot 3)
  db/              Client Firestore + repositories (lot 2)
  ai/              Generation des questions hebdomadaires via Gemini
  scheduler/       Endpoints Cloud Scheduler: weekly-reset (lundi), trigger-cycle (vendredi), interests-reminder
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
