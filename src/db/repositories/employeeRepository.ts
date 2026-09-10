import type { Firestore } from '@google-cloud/firestore';
import type { EmployeeId, EmployeeProfile } from '../../domain/types.js';
import { COLLECTIONS } from '../firestore.js';

export interface EmployeeRepository {
  findById(id: EmployeeId): Promise<EmployeeProfile | undefined>;
  listActive(): Promise<EmployeeProfile[]>;
  upsert(profile: EmployeeProfile): Promise<void>;
  setStatus(id: EmployeeId, status: EmployeeProfile['status']): Promise<void>;
}

export function createFirestoreEmployeeRepository(db: Firestore): EmployeeRepository {
  const collection = db.collection(COLLECTIONS.employees);

  return {
    async findById(id) {
      const doc = await collection.doc(id).get();
      return doc.exists ? (doc.data() as EmployeeProfile) : undefined;
    },

    async listActive() {
      const snapshot = await collection.where('status', '==', 'active').get();
      return snapshot.docs.map((doc) => doc.data() as EmployeeProfile);
    },

    async upsert(profile) {
      await collection.doc(profile.id).set(profile, { merge: true });
    },

    async setStatus(id, status) {
      await collection.doc(id).update({ status, updatedAt: new Date() });
    },
  };
}
