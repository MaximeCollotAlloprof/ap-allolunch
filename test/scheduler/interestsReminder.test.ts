import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { EmployeeId, EmployeeProfile } from '../../src/domain/types.js';
import type { EmployeeRepository } from '../../src/db/repositories/employeeRepository.js';
import type { WeeklyQuestionSetRepository } from '../../src/db/repositories/weeklyQuestionSetRepository.js';
import type { ChatNotifier } from '../../src/chat/chatNotifier.js';
import { buildAnswerId } from '../../src/chat/interestsQuestionnaire.js';
import { createInterestsReminderRouter } from '../../src/scheduler/interestsReminder.js';
import { TEST_QUESTIONS, TEST_QUESTION_SET } from '../fixtures/weeklyQuestions.js';

function employee(overrides: Partial<EmployeeProfile> & { id: EmployeeId }): EmployeeProfile {
  const now = new Date();
  return {
    displayName: overrides.id,
    status: 'active',
    interestAnswers: [],
    availableDays: [],
    interestsQuestionnaireActive: false,
    awaitingAvailability: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const ALL_ANSWERS = TEST_QUESTIONS.map((q) => buildAnswerId(q.category, q.options[0]!.id));

function createEmployeeRepository(employees: EmployeeProfile[]): EmployeeRepository {
  return {
    findById: (id) => Promise.resolve(employees.find((e) => e.id === id)),
    listActive: () => Promise.resolve(employees.filter((e) => e.status === 'active')),
    listAll: () => Promise.resolve(employees),
    upsert: () => Promise.resolve(),
    setStatus: () => Promise.resolve(),
  };
}

function createWeeklyQuestionSetRepository(): WeeklyQuestionSetRepository {
  return {
    get: () => Promise.resolve(TEST_QUESTION_SET),
    set: () => Promise.resolve(),
  };
}

function createApp(employees: EmployeeProfile[], chatNotifier: ChatNotifier) {
  const app = express();
  app.use(express.json());
  app.use(
    createInterestsReminderRouter({
      employeeRepository: createEmployeeRepository(employees),
      weeklyQuestionSetRepository: createWeeklyQuestionSetRepository(),
      chatNotifier,
    }),
  );
  return app;
}

describe('interests-reminder', () => {
  it('rappelle uniquement les employes actifs avec un profil incomplet et un chatSpaceName connu', async () => {
    const incomplete = employee({
      id: 'incomplete@example.com',
      interestAnswers: [buildAnswerId('musique', '1')],
      chatSpaceName: 'spaces/incomplete',
    });
    const complete = employee({
      id: 'complete@example.com',
      // toutes les questions repondues -> pas de rappel
      interestAnswers: ALL_ANSWERS,
      chatSpaceName: 'spaces/complete',
    });
    const noChatSpace = employee({ id: 'no-space@example.com', interestAnswers: [] });
    const paused = employee({
      id: 'paused@example.com',
      status: 'paused',
      interestAnswers: [],
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
      interestAnswers: [],
      chatSpaceName: 'spaces/alice',
    });
    const bob = employee({
      id: 'bob@example.com',
      interestAnswers: [],
      chatSpaceName: 'spaces/bob',
    });

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
