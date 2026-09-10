import 'dotenv/config';
import { getFirestore } from '../src/db/firestore.js';
import { createFirestoreEmployeeRepository } from '../src/db/repositories/employeeRepository.js';
import type { EmployeeProfile } from '../src/domain/types.js';

/**
 * Peuple l'emulateur Firestore local avec quelques employes de test, pour pouvoir
 * declencher un cycle de matching complet sans tout saisir a la main dans l'UI.
 * Usage: npm run emulator (terminal 1), puis npm run seed:local (terminal 2).
 */
const sampleEmployees: Omit<
  EmployeeProfile,
  'createdAt' | 'updatedAt' | 'interestsQuestionnaireActive'
>[] = [
  {
    id: 'alice@alloprof.qc.ca',
    displayName: 'Alice',
    status: 'active',
    interestTags: ['cuisine', 'sport'],
    availableDays: ['lundi', 'mardi'],
  },
  {
    id: 'bob@alloprof.qc.ca',
    displayName: 'Bob',
    status: 'active',
    interestTags: ['cuisine'],
    availableDays: ['lundi'],
  },
  {
    id: 'carol@alloprof.qc.ca',
    displayName: 'Carol',
    status: 'active',
    interestTags: ['technologie'],
    availableDays: ['mardi'],
  },
  {
    id: 'dave@alloprof.qc.ca',
    displayName: 'Dave',
    status: 'active',
    interestTags: ['plein-air'],
    availableDays: ['jeudi'],
  },
  {
    id: 'erin@alloprof.qc.ca',
    displayName: 'Erin',
    status: 'active',
    interestTags: ['musique', 'cinema'],
    availableDays: ['vendredi'],
  },
];

async function main(): Promise<void> {
  const projectId = process.env.FIRESTORE_PROJECT_ID ?? 'demo-allolunch';
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST non defini - ce script ne doit tourner que contre l'emulateur local.",
    );
  }

  const db = getFirestore(projectId);
  const repository = createFirestoreEmployeeRepository(db);
  const now = new Date();

  for (const employee of sampleEmployees) {
    await repository.upsert({
      ...employee,
      interestsQuestionnaireActive: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log(`${sampleEmployees.length} employes de test ajoutes a l'emulateur (${projectId}).`);
}

await main();
