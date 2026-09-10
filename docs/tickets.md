# Decoupage en tickets - MVP AlloLunch

Trois lots verticaux, un par personne. Chaque lot peut avancer en parallele grace aux
interfaces deja definies dans le scaffold (`ChatCommandHandler`, `CalendarService`,
`EmployeeRepository`, `MatchHistoryRepository`).

## Lot 1 - Bot Google Chat + questionnaire (`src/chat/`)

- [x] Enregistrer l'app Google Chat dans la console GCP (nom, avatar, description).
- [x] Verifier l'en-tete Bearer des requetes entrantes (`req.headers.authorization`) pour
      confirmer qu'elles viennent bien de Google Chat, avant tout traitement.
- [x] Implementer `/rejoindre` - cree/active le profil de l'employe (opt-in).
- [x] Implementer `/pause` - passe le statut de l'employe a `paused`.
- [x] Implementer `/interets` - flow conversationnel pour repondre aux questions
      generees par Gemini pour la semaine en cours (voir lot 4).
- [x] `/interets modifier [numero]` et `/interets supprimer <numero>` - changer ou effacer
      une reponse deja donnee, sans repasser par tout le questionnaire.
- [x] Implementer `/disponibilites` - saisie des jours disponibles (`DayOfWeek`).
- [x] Implementer `/profil` - affiche le profil courant de l'employe.
- [x] Message de notification envoye a chaque membre d'un groupe quand un match est cree
      (declenche depuis `scheduler/triggerCycle.ts`, a brancher).
- [ ] Rappel automatique si un match ne repond pas apres X jours (pas de penalite, cf. CLAUDE.md).
- [x] Rappel periodique pour completer le questionnaire /interets: nouvel endpoint
      `POST /scheduler/interests-reminder` (`src/scheduler/interestsReminder.ts`), a
      brancher sur un Cloud Scheduler separe (cadence a definir, ex: hebdomadaire) - voir
      lot 3 pour le provisionnement.
- [x] Gerer le cas de la commande inconnue (`/aide` listant les commandes disponibles).

## Lot 2 - Moteur de matching + Firestore (`src/matching/`, `src/db/`)

- [x] Fonction pure `formMatchGroups` (groupes 2-4, anti-repetition, gestion des isoles) -
      deja scaffolde et teste, a faire evoluer si de nouvelles regles emergent.
- [x] Finaliser le schema Firestore (`employees`, `matchGroups`, `matchCycles`) et les regles
      de securite Firestore (acces restreint au service Cloud Run uniquement).
- [x] Completer `matchHistoryRepository.getRecentPairs` si la requete par `limit` s'avere
      insuffisante a l'echelle (envisager un champ `cycleIndex` pour filtrer proprement par
      fenetre de N cycles plutot qu'un `limit` approximatif).
- [x] Ajouter la persistance du `matchCycle` (statut `pending` -> `completed`) autour de
      l'appel a `formMatchGroups` dans `triggerCycle.ts`.
- [ ] Tests d'integration Firestore (emulateur) pour les repositories.
- [ ] Definir et documenter la politique de retention des donnees (combien de temps garder
      l'historique de matchs et les profils d'employes inactifs).

## Lot 3 - Integration Calendar + infra/deploiement (`src/calendar/`, infra)

- [x] Configurer la delegation domain-wide du service account (Google Workspace Admin Console)
      avec le scope `https://www.googleapis.com/auth/calendar.events`. Teste en conditions
      reelles (creation d'un vrai evenement Calendar + notification Chat pour un cycle complet) -
      `createGoogleCalendarService` impersonne `CALENDAR_DELEGATED_SERVICE_ACCOUNT_EMAIL` comme
      organisateur/sujet via `GoogleAuth.clientOptions.subject`.
- [x] Implementer `createGoogleCalendarService` avec `googleapis` (`calendar.events.insert`),
      en impersonnant l'organisateur via le service account.
- [x] Determiner le creneau propose a partir des `availableDays` communs du groupe (regle
      simple pour le MVP, ex: premier jour disponible chez tous).
- [ ] Provisionner le projet GCP: Cloud Run, **deux** jobs Cloud Scheduler (fuseau horaire
      explicite, ex: America/Toronto) - lundi matin -> `POST /scheduler/weekly-reset`,
      vendredi 9h -> `POST /scheduler/trigger-cycle` -, Secret Manager, Firestore.
- [ ] Verifier l'en-tete OIDC injecte par Cloud Scheduler sur `/scheduler/trigger-cycle`
      et `/scheduler/weekly-reset` pour s'assurer que seul Cloud Scheduler peut les declencher.
- [ ] Pipeline de build/push de l'image Docker + deploiement Cloud Run (GitHub Actions,
      a ajouter en complement de `ci.yml`).
- [ ] Definir les environnements (dev/staging/prod) et leurs projets GCP respectifs.
- [ ] Documenter la procedure d'obtention/rotation des credentials dans le README.
- [ ] Obtenir une cle API Gemini (Google AI Studio) et la stocker en Secret Manager -
      voir lot 4.

## Lot 4 - Cycle hebdomadaire IA (`src/ai/`, `src/scheduler/weeklyReset.ts`)

- [x] `POST /scheduler/weekly-reset`: genere les 12 questions de la semaine via l'API
      Gemini (`src/ai/geminiQuestionGenerator.ts`, sortie validee par un schema `zod`),
      remet a zero les profils (centres d'interet, disponibilites, statut -> `paused`) de
      tous les employes connus, et diffuse un message d'annonce.
- [x] Si Gemini echoue ou renvoie un format invalide: aucun fallback automatique - le
      `WeeklyQuestionSet` passe en `status: 'paused'`, aucun profil n'est touche, et
      `/scheduler/trigger-cycle` du vendredi suivant ne matche personne cette semaine-la.
- [x] `/rejoindre` devient une action hebdomadaire obligatoire: refuse si la semaine est
      en pause, sinon redemande toujours les disponibilites en premier (avant les
      questions) si elles sont vides pour la semaine en cours.
- [x] `EmployeeProfile.interestAnswers: string[]` (format `${category}:${optionId}`)
      remplace l'ancien `interestTags: InterestTag[]` statique - le questionnaire
      (`src/chat/interestsQuestionnaire.ts`) est desormais pilote par le
      `WeeklyQuestionSet` courant plutot qu'un tableau fixe.
- [ ] Decider si `/scheduler/interests-reminder` (lot 1) reste pertinent tel quel avec
      l'echeance fixe du vendredi 9h, ou doit changer de cadence/etre retire.

## Hors-scope MVP (V2 potentielle)

- Tableau de bord admin (participation, taux de reponse, opt-outs).
- Support multilingue (anglais).
- Lecture du free/busy Google Calendar pour proposer des creneaux automatiquement.
- Historique des jeux de questions hebdomadaires (un seul document "courant" pour le MVP).
