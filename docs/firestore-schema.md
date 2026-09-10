# Schema Firestore - AlloLunch

Trois collections racine, toutes accedees exclusivement via le SDK Admin (service Cloud Run).
Voir `firestore.rules` pour les regles d'acces.

## `employees`

Un document par employe. **L'ID du document est l'adresse email Google de l'employe**
(`event.message.sender.email` dans `src/chat/webhook.ts`).

| Champ          | Type                  | Description                                              |
| -------------- | --------------------- | ---------------------------------------------------------- |
| `id`           | `string`               | Email de l'employe (duplique l'ID du document).           |
| `displayName`  | `string`               | Nom affiche, fourni par Google Chat.                       |
| `status`       | `'active' \| 'paused'` | Opt-in/opt-out de la participation aux cycles.             |
| `interestTags` | `InterestTag[]`        | Liste fermee, voir `src/domain/types.ts`.                  |
| `availableDays`| `DayOfWeek[]`          | Jours disponibles (`lundi`...`vendredi`).                   |
| `createdAt`    | `Timestamp`            | Date de creation du profil.                                 |
| `updatedAt`    | `Timestamp`            | Derniere modification (statut, interets, disponibilites).   |

**Requetes utilisees**: `where('status', '==', 'active')` (liste des participants actifs
avant de former les groupes) - index simple champ, automatique.

**Donnee sensible**: l'ID de document (email) est une donnee personnelle identifiable.
Voir la politique de retention (tache separee) pour la duree de conservation.

## `matchCycles`

Un document par cycle hebdomadaire declenche par Cloud Scheduler.

| Champ       | Type                      | Description                                    |
| ----------- | ------------------------- | ------------------------------------------------ |
| `id`         | `string` (UUID)            | Genere par `triggerCycle.ts`, sert d'ID document.  |
| `cycleIndex` | `number`                   | Compteur sequentiel (1, 2, 3, ...), incremente a chaque cycle. Sert a filtrer une fenetre de N cycles sans `limit()` approximatif. |
| `startedAt`  | `Timestamp`                | Horodatage du declenchement du cycle.              |
| `status`     | `'pending' \| 'completed'` | `pending` a la creation, `completed` si le cycle va au bout sans erreur. Reste `pending` en cas d'echec (voir `triggerCycle.ts`), ce qui permet de reperer les cycles a inspecter/relancer. |

**Requetes utilisees**: `orderBy('cycleIndex', 'desc').limit(1)` dans
`matchCycleRepository.getLatestCycleIndex` (determine le prochain cycleIndex a utiliser) -
index simple champ, automatique.

## `matchGroups`

Un document par groupe forme (2 a 4 employes) lors d'un cycle.

| Champ             | Type         | Description                                              |
| ----------------- | ------------ | ----------------------------------------------------------|
| `id`              | `string` (UUID) | Sert d'ID document.                                     |
| `cycleId`         | `string`      | Reference vers `matchCycles/{id}`.                        |
| `cycleIndex`      | `number`      | Duplique de `matchCycles.cycleIndex` - evite un lookup supplementaire pour filtrer par fenetre de cycles. |
| `employeeIds`     | `string[]`    | Emails des membres du groupe (2 a 4).                      |
| `calendarEventId` | `string?`     | Rempli par le lot Calendar une fois l'invitation creee.    |
| `createdAt`       | `Timestamp`   | Date de creation du groupe.                                |

**Requetes utilisees**: `where('cycleIndex', '>=', currentCycleIndex - windowCycles)` dans
`matchHistoryRepository.getRecentPairs` - index simple champ, automatique. Remplace l'ancien
`limit(windowCycles * 50)` approximatif par un filtre exact sur le nombre de cycles.

## Index composites

Aucun index composite requis pour l'instant - toutes les requetes actuelles filtrent ou
trient sur un seul champ. A reevaluer si `cycleIndex` est ajoute (une requete
`where('cycleIndex', '>=', x).orderBy('cycleIndex')` reste un index simple, mais toute
combinaison avec un `where` supplementaire en necessiterait un).

## Securite

Voir `firestore.rules` (racine du repo): acces refuse a tout client Firestore (mobile/web SDK).
Seul le SDK Admin, via les Application Default Credentials du service Cloud Run, peut lire/
ecrire ces collections - ces requetes ne passent pas par les regles de securite Firestore.
