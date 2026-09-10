# Lancer AlloLunch en local

Objectif: valider le code (moteur de matching, endpoints, persistance Firestore) sans
toucher a un vrai projet GCP. Utile avant chaque deploiement, et pour developper les
lots 1/2 sans attendre que l'infra (lot 3) soit provisionnee.

Ce que ca ne couvre **pas** en local: l'envoi reel de messages Google Chat (le bot n'est
pas encore enregistre aupres de Google) et la creation reelle d'evenements Calendar
(`createGoogleCalendarService` reste un stub tant que le lot 3 n'est pas fait). On peut
neanmoins simuler des appels HTTP entrants et verifier toute la logique metier autour.

## 1. Preparer l'environnement

```bash
npm install
cp .env.local.example .env
```

`FIRESTORE_PROJECT_ID=demo-allolunch` utilise le prefixe `demo-` reconnu par l'emulateur
Firestore: aucune authentification GCP n'est necessaire.

## 2. Demarrer l'emulateur Firestore (terminal 1)

```bash
npm run emulator
```

L'UI de l'emulateur est disponible sur http://localhost:4001 (utile pour inspecter les
documents crees pendant les tests manuels).

## 3. Demarrer le serveur (terminal 2)

```bash
npm run dev
```

Verifier que le serveur demarre bien et se connecte a l'emulateur (aucune erreur
d'authentification GCP au demarrage - si vous en voyez une, verifiez que
`FIRESTORE_EMULATOR_HOST` est bien charge depuis `.env`).

## 4. Simuler un message Google Chat

Le webhook verifie desormais le token Bearer signe par Google (`src/chat/auth.ts`) avant
tout traitement - un `curl` avec un faux token recoit donc directement un `401`. Pour
tester la logique des commandes sans passer par un vrai token, le plus simple est de
s'appuyer sur `test/chat/webhook.test.ts`, qui injecte un `verifyBearerToken` stub. Pour
un test en conditions reelles avec un vrai token Google, voir la section 6 (tunnel).

A titre de reference, le format reel d'un evenement Google Chat (app configuree via
l'API Google Chat / Workspace Add-ons) ressemble a:

```json
{
  "chat": {
    "appCommandPayload": {
      "message": {
        "text": "/profil",
        "sender": { "email": "test@alloprof.qc.ca", "displayName": "Test" }
      }
    }
  }
}
```

## 5. Declencher un cycle de matching

Ajouter d'abord quelques employes actifs directement dans l'emulateur (via son UI sur
http://localhost:4001, collection `employees`), puis:

```bash
curl -X POST http://localhost:8080/scheduler/trigger-cycle
```

La reponse contient `groupCount` et `deferredCount`. Les groupes crees sont visibles dans
la collection `matchGroups` de l'UI de l'emulateur - ca valide tout le pipeline
(lecture des employes actifs -> moteur de matching -> persistance) sans dependance GCP.

## 6. Exposer le bot a Google Chat depuis votre poste (tunnel HTTPS)

Google Chat n'appelle jamais `localhost` - il faut un tunnel HTTPS public vers votre
serveur local pour tester le bot en conditions reelles avant un deploiement.

1. Creer un compte gratuit sur https://dashboard.ngrok.com/signup (une seule fois).
2. Recuperer votre authtoken: https://dashboard.ngrok.com/get-started/your-authtoken
3. Le configurer en local (une seule fois par machine):
   ```bash
   ngrok config add-authtoken <votre-authtoken>
   ```
4. Lancer le tunnel (`npm run dev` doit deja tourner dans un autre terminal):
   ```bash
   npm run tunnel
   ```
5. Copier l'URL HTTPS affichee (ex: `https://xxxx.ngrok-free.app`) et la coller comme
   "HTTP endpoint URL" dans la configuration de l'app Google Chat (console Google Cloud
   > Google Chat API > Configuration), suivie de `/chat/webhook`.
6. Mettre a jour `CHAT_WEBHOOK_URL` dans `.env` avec cette meme URL complete
   (`https://xxxx.ngrok-free.app/chat/webhook`) et redemarrer `npm run dev` - c'est
   l'audience que le webhook attend dans le token signe par Google (`src/chat/auth.ts`).
   Sur le plan gratuit ngrok, l'URL change a chaque redemarrage du tunnel: repeter cette
   etape (console Chat + `.env`) a chaque fois.

## 7. Avant de deployer sur GCP

- `npm run lint && npm run typecheck && npm test && npm run build` doivent tous passer
  (verifie aussi automatiquement par la CI).
- Les regles Firestore de `firestore.rules` sont permissives et **valables pour
  l'emulateur uniquement** - ne jamais les deployer telles quelles sur un vrai projet
  (voir le ticket regles de securite dans `docs/tickets.md`, lot 2).
