import type { Firestore } from '@google-cloud/firestore';
import type { WeeklyQuestionSet } from '../../domain/types.js';
import { COLLECTIONS } from '../firestore.js';

const CURRENT_DOC_ID = 'current';

export interface WeeklyQuestionSetRepository {
  get(): Promise<WeeklyQuestionSet | undefined>;
  set(questionSet: WeeklyQuestionSet): Promise<void>;
}

/**
 * Un seul document "courant", ecrase chaque lundi par le job de reset
 * (src/scheduler/weeklyReset.ts) - pas d'historique par semaine pour le MVP.
 */
export function createFirestoreWeeklyQuestionSetRepository(
  db: Firestore,
): WeeklyQuestionSetRepository {
  const doc = db.collection(COLLECTIONS.weeklyQuestionSets).doc(CURRENT_DOC_ID);

  return {
    async get() {
      const snapshot = await doc.get();
      return snapshot.exists ? (snapshot.data() as WeeklyQuestionSet) : undefined;
    },

    async set(questionSet) {
      await doc.set(questionSet);
    },
  };
}
