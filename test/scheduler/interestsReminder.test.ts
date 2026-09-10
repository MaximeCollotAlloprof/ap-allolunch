import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { EmployeeId, EmployeeProfile } from '../../src/domain/types.js';
import type { EmployeeRepository } from '../../src/db/repositories/employeeRepository.js';
import type { ChatNotifier } from '../../src/chat/chatNotifier.js';
import { createInterestsReminderRouter } from '../../src/scheduler/interestsReminder.js';

function employee(overrides: Partial<EmployeeProfile> & { id: EmployeeId }): EmployeeProfile {
  const now = new Date();
  return {
    displayName: overrides.id,
    status: 'active',
    interestTags: [],
    availableDays: [],
    interestsQuestionnaireActive: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createEmployeeRepository(employees: EmployeeProfile[]): EmployeeRepository {
  return {
    findById: (id) => Promise.resolve(employees.find((e) => e.id === id)),
    listActive: () => Promise.resolve(employees.filter((e) => e.status === 'active')),
    upsert: () => Promise.resolve(),
    setStatus: () => Promise.resolve(),
  };
}

function createApp(employees: EmployeeProfile[], chatNotifier: ChatNotifier) {
  const app = express();
  app.use(express.json());
  app.use(
    createInterestsReminderRouter({
      employeeRepository: createEmployeeRepository(employees),
      chatNotifier,
    }),
  );
  return app;
}

describe('interests-reminder', () => {
  it('rappelle uniquement les employes actifs avec un profil incomplet et un chatSpaceName connu', async () => {
    const incomplete = employee({
      id: 'incomplete@example.com',
      interestTags: ['musique', 'musique-rock'],
      chatSpaceName: 'spaces/incomplete',
    });
    const complete = employee({
      id: 'complete@example.com',
      // toutes les questions repondues -> pas de rappel
      interestTags: [
        'cuisine',
        'cuisine-italienne',
        'sport',
        'sport-hockey',
        'voyage',
        'voyage-plage',
        'technologie',
        'technologie-ia',
        'jeux-video',
        'jeux-video-rpg',
        'lecture',
        'lecture-romans',
        'musique',
        'musique-rock',
        'cinema',
        'cinema-action',
        'plein-air',
        'plein-air-velo',
        'art-creatif',
        'art-creatif-dessin',
        'famille-enfants',
        'famille-enfants-sans-enfants',
        'entrepreneuriat',
        'entrepreneuriat-startup',
      ],
      chatSpaceName: 'spaces/complete',
    });
    const noChatSpace = employee({ id: 'no-space@example.com', interestTags: [] });
    const paused = employee({
      id: 'paused@example.com',
      status: 'paused',
      interestTags: [],
      chatSpaceName: 'spaces/paused',
    });

    const sendDirectMessage = vi.fn(() => Promise.resolve());
    const app = createApp([incomplete, complete, noChatSpace, paused], { sendDirectMessage });

    const res: unknown = await request(app).post('/scheduler/interests-reminder');
    const typed = res as { status: number; body: { remindedCount: number } };

    expect(typed.status).toBe(200);
    expect(typed.body.remindedCount).toBe(1);
    expect(sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(sendDirectMessage).toHaveBeenCalledWith(
      'spaces/incomplete',
      expect.stringContaining('/interets'),
    );
  });

  it("un echec d'envoi pour un employe n'empeche pas de relancer les autres", async () => {
    const alice = employee({
      id: 'alice@example.com',
      interestTags: [],
      chatSpaceName: 'spaces/alice',
    });
    const bob = employee({ id: 'bob@example.com', interestTags: [], chatSpaceName: 'spaces/bob' });

    const sendDirectMessage = vi.fn((spaceName: string) =>
      spaceName === 'spaces/alice' ? Promise.reject(new Error('down')) : Promise.resolve(),
    );
    const app = createApp([alice, bob], { sendDirectMessage });

    const res: unknown = await request(app).post('/scheduler/interests-reminder');
    const typed = res as { status: number; body: { remindedCount: number } };

    expect(typed.status).toBe(200);
    expect(typed.body.remindedCount).toBe(1);
    expect(sendDirectMessage).toHaveBeenCalledTimes(2);
  });
});
