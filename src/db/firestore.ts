import { Firestore } from '@google-cloud/firestore';

let client: Firestore | undefined;

/**
 * Client Firestore singleton. En production/CI, l'authentification passe par les
 * Application Default Credentials (service account du service Cloud Run) - aucune
 * cle n'est stockee dans le code ou le repo.
 */
export function getFirestore(projectId: string): Firestore {
  client ??= new Firestore({ projectId });
  return client;
}

export const COLLECTIONS = {
  employees: 'employees',
  matchCycles: 'matchCycles',
  matchGroups: 'matchGroups',
} as const;
