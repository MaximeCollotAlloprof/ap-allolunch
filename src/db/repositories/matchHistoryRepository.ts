import type { Firestore } from '@google-cloud/firestore';
import { buildPairKey } from '../../matching/engine.js';
import type { MatchGroup } from '../../domain/types.js';
import { COLLECTIONS } from '../firestore.js';

export interface MatchHistoryRepository {
  /** Toutes les paires deja matchees ensemble dans les `windowCycles` derniers cycles completes. */
  getRecentPairs(windowCycles: number): Promise<Set<string>>;
  saveGroups(groups: MatchGroup[]): Promise<void>;
}

export function createFirestoreMatchHistoryRepository(db: Firestore): MatchHistoryRepository {
  const groupsCollection = db.collection(COLLECTIONS.matchGroups);

  return {
    async getRecentPairs(windowCycles) {
      const snapshot = await groupsCollection
        .orderBy('createdAt', 'desc')
        .limit(windowCycles * 50) // hypothese haute du nb de groupes par cycle, affinable
        .get();

      const recentPairs = new Set<string>();
      for (const doc of snapshot.docs) {
        const group = doc.data() as MatchGroup;
        for (let i = 0; i < group.employeeIds.length; i++) {
          for (let j = i + 1; j < group.employeeIds.length; j++) {
            const a = group.employeeIds[i];
            const b = group.employeeIds[j];
            if (a && b) recentPairs.add(buildPairKey(a, b));
          }
        }
      }
      return recentPairs;
    },

    async saveGroups(groups) {
      const batch = db.batch();
      for (const group of groups) {
        batch.set(groupsCollection.doc(group.id), group);
      }
      await batch.commit();
    },
  };
}
