# AlloLunch

Bot Google Chat qui associe aleatoirement des employes (2 a 4 personnes) selon leurs
centres d'interet pour diner ensemble et briser les silos, avec creation automatique
d'une invitation Google Calendar pour chaque groupe matche.

Voir [CLAUDE.md](CLAUDE.md) pour les decisions produit, l'architecture et les conventions
de developpement, et [docs/tickets.md](docs/tickets.md) pour le decoupage du travail.

## Prerequis

- Node.js 20+
- Un projet GCP avec Firestore et l'API Google Chat activee (fourni par le lot infra)

## Demarrage

Pour lancer AlloLunch en local sans dependance a un vrai projet GCP (emulateur
Firestore), voir [docs/local-dev.md](docs/local-dev.md) - c'est le point de depart
recommande avant tout deploiement.

Pour un lancement contre un vrai projet GCP:

```bash
cp .env.example .env   # remplir les valeurs (voir docs/tickets.md - lot 3)
npm install
npm run dev
```

## Scripts

| Commande            | Description                                 |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Serveur local avec rechargement automatique |
| `npm test`          | Tests unitaires (Vitest)                    |
| `npm run lint`      | ESLint                                      |
| `npm run format`    | Prettier (applique les corrections)         |
| `npm run typecheck` | Verification TypeScript sans compilation    |
| `npm run build`     | Compilation vers `dist/`                    |
