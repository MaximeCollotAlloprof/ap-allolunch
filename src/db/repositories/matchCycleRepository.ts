import type { Firestore } from '@google-cloud/firestore';
import type { MatchCycle } from '../../domain/types.js';
import { COLLECTIONS } from '../firestore.js';

export interface MatchCycleRepository {
  create(cycle: MatchCycle): Promise<void>;
  markCompleted(id: MatchCycle['id']): Promise<void>;
  /** Retourne le cycleIndex du dernier cycle cree, ou 0 si aucun cycle n'existe encore. */
  getLatestCycleIndex(): Promise<number>;
}

export function createFirestoreMatchCycleRepository(db: Firestore): MatchCycleRepository {
  const collection = db.collection(COLLECTIONS.matchCycles);

  return {
    async create(cycle) {
      await collection.doc(cycle.id).set(cycle);
    },

    async markCompleted(id) {
      await collection.doc(id).update({ status: 'completed' satisfies MatchCycle['status'] });
    },

    async getLatestCycleIndex() {
      const snapshot = await collection.orderBy('cycleIndex', 'desc').limit(1).get();
      const latest = snapshot.docs[0]?.data() as MatchCycle | undefined;
      return latest?.cycleIndex ?? 0;
    },
  };
}
