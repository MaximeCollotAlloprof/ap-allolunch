# Decoupage en tickets - MVP AlloLunch

Trois lots verticaux, un par personne. Chaque lot peut avancer en parallele grace aux
interfaces deja definies dans le scaffold (`ChatCommandHandler`, `CalendarService`,
`EmployeeRepository`, `MatchHistoryRepository`).

## Lot 1 - Bot Google Chat + questionnaire (`src/chat/`)

- [ ] Enregistrer l'app Google Chat dans la console GCP (nom, avatar, description).
- [ ] Verifier l'en-tete Bearer des requetes entrantes (`req.headers.authorization`) pour
      confirmer qu'elles viennent bien de Google Chat, avant tout traitement.
- [ ] Implementer `/rejoindre` - cree/active le profil de l'employe (opt-in).
- [ ] Implementer `/pause` - passe le statut de l'employe a `paused`.
- [ ] Implementer `/interets` - flow conversationnel pour choisir des tags parmi `InterestTag`.
- [ ] Implementer `/disponibilites` - saisie des jours disponibles (`DayOfWeek`).
- [ ] Implementer `/profil` - affiche le profil courant de l'employe.
- [ ] Message de notification envoye a chaque membre d'un groupe quand un match est cree
      (declenche depuis `scheduler/triggerCycle.ts`, a brancher).
- [ ] Rappel automatique si un match ne repond pas apres X jours (pas de penalite, cf. CLAUDE.md).
- [ ] Gerer le cas de la commande inconnue (`/aide` listant les commandes disponibles).

## Lot 2 - Moteur de matching + Firestore (`src/matching/`, `src/db/`)

- [x] Fonction pure `formMatchGroups` (groupes 2-4, anti-repetition, gestion des isoles) -
      deja scaffolde et teste, a faire evoluer si de nouvelles regles emergent.
- [ ] Finaliser le schema Firestore (`employees`, `matchGroups`, `matchCycles`) et les regles
      de securite Firestore (acces restreint au service Cloud Run uniquement).
- [ ] Completer `matchHistoryRepository.getRecentPairs` si la requete par `limit` s'avere
      insuffisante a l'echelle (envisager un champ `cycleIndex` pour filtrer proprement par
      fenetre de N cycles plutot qu'un `limit` approximatif).
- [ ] Ajouter la persistance du `matchCycle` (statut `pending` -> `completed`) autour de
      l'appel a `formMatchGroups` dans `triggerCycle.ts`.
- [ ] Tests d'integration Firestore (emulateur) pour les repositories.
- [ ] Definir et documenter la politique de retention des donnees (combien de temps garder
      l'historique de matchs et les profils d'employes inactifs).

## Lot 3 - Integration Calendar + infra/deploiement (`src/calendar/`, infra)

- [ ] Configurer la delegation domain-wide du service account (Google Workspace Admin Console)
      avec le scope `https://www.googleapis.com/auth/calendar.events`.
- [ ] Implementer `createGoogleCalendarService` avec `googleapis` (`calendar.events.insert`),
      en impersonnant l'organisateur via le service account.
- [ ] Determiner le creneau propose a partir des `availableDays` communs du groupe (regle
      simple pour le MVP, ex: premier jour disponible chez tous).
- [ ] Provisionner le projet GCP: Cloud Run, Cloud Scheduler (cron hebdomadaire ->
      `POST /scheduler/trigger-cycle`), Secret Manager, Firestore.
- [ ] Verifier l'en-tete OIDC injecte par Cloud Scheduler sur `/scheduler/trigger-cycle`
      pour s'assurer que seul Cloud Scheduler peut declencher un cycle.
- [ ] Pipeline de build/push de l'image Docker + deploiement Cloud Run (GitHub Actions,
      a ajouter en complement de `ci.yml`).
- [ ] Definir les environnements (dev/staging/prod) et leurs projets GCP respectifs.
- [ ] Documenter la procedure d'obtention/rotation des credentials dans le README.

## Hors-scope MVP (V2 potentielle)

- Tableau de bord admin (participation, taux de reponse, opt-outs).
- Matching par similarite semantique (texte libre + embeddings) plutot que tags predefinis.
- Support multilingue (anglais).
- Lecture du free/busy Google Calendar pour proposer des creneaux automatiquement.
