import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { EmployeeId, EmployeeProfile, WeeklyQuestionSet } from '../../src/domain/types.js';
import type { EmployeeRepository } from '../../src/db/repositories/employeeRepository.js';
import type { WeeklyQuestionSetRepository } from '../../src/db/repositories/weeklyQuestionSetRepository.js';
import type { GeminiQuestionGenerator } from '../../src/ai/geminiQuestionGenerator.js';
import type { ChatNotifier } from '../../src/chat/chatNotifier.js';
import { buildAnswerId } from '../../src/chat/interestsQuestionnaire.js';
import { createWeeklyResetRouter } from '../../src/scheduler/weeklyReset.js';
import { TEST_QUESTIONS } from '../fixtures/weeklyQuestions.js';

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

function createEmployeeRepository(employees: EmployeeProfile[]) {
  const saved: EmployeeProfile[] = [];
  const repo: EmployeeRepository = {
    findById: (id) => Promise.resolve(employees.find((e) => e.id === id)),
    listActive: () => Promise.resolve(employees.filter((e) => e.status === 'active')),
    listAll: () => Promise.resolve(employees),
    upsert: (profile) => {
      saved.push(profile);
      return Promise.resolve();
    },
    setStatus: () => Promise.resolve(),
  };
  return { repo, saved };
}

function createWeeklyQuestionSetRepository() {
  const saved: WeeklyQuestionSet[] = [];
  const repo: WeeklyQuestionSetRepository = {
    get: () => Promise.resolve(saved[saved.length - 1]),
    set: (questionSet) => {
      saved.push(questionSet);
      return Promise.resolve();
    },
  };
  return { repo, saved };
}

function createApp(deps: {
  employees: EmployeeProfile[];
  geminiQuestionGenerator: GeminiQuestionGenerator;
  chatNotifier: ChatNotifier;
}) {
  const { repo: employeeRepository, saved: savedProfiles } = createEmployeeRepository(
    deps.employees,
  );
  const { repo: weeklyQuestionSetRepository, saved: savedQuestionSets } =
    createWeeklyQuestionSetRepository();

  const app = express();
  app.use(express.json());
  app.use(
    createWeeklyResetRouter({
      employeeRepository,
      weeklyQuestionSetRepository,
      geminiQuestionGenerator: deps.geminiQuestionGenerator,
      chatNotifier: deps.chatNotifier,
    }),
  );
  return { app, savedProfiles, savedQuestionSets };
}

async function weeklyReset(app: express.Express) {
  const res: unknown = await request(app).post('/scheduler/weekly-reset');
  return res as { status: number; body: { weekId: string; status: string } };
}

describe('weekly-reset', () => {
  it('genere les questions, remet a zero les profils et annonce la nouvelle semaine', async () => {
    const alice = employee({
      id: 'alice@example.com',
      chatSpaceName: 'spaces/alice',
      interestAnswers: [buildAnswerId('cuisine', '1')],
      availableDays: ['lundi'],
      status: 'active',
    });
    const generateWeeklyQuestions = vi.fn(() => Promise.resolve(TEST_QUESTIONS));
    const sendDirectMessage = vi.fn(() => Promise.resolve());

    const { app, savedProfiles, savedQuestionSets } = createApp({
      employees: [alice],
      geminiQuestionGenerator: { generateWeeklyQuestions },
      chatNotifier: { sendDirectMessage },
    });

    const res = await weeklyReset(app);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');

    expect(savedQuestionSets).toHaveLength(1);
    expect(savedQuestionSets[0]?.status).toBe('ready');
    expect(savedQuestionSets[0]?.questions).toEqual(TEST_QUESTIONS);

    expect(savedProfiles).toHaveLength(1);
    expect(savedProfiles[0]?.status).toBe('paused');
    expect(savedProfiles[0]?.interestAnswers).toEqual([]);
    expect(savedProfiles[0]?.availableDays).toEqual([]);

    expect(sendDirectMessage).toHaveBeenCalledWith(
      'spaces/alice',
      expect.stringContaining('/rejoindre'),
    );
  });

  it('annonce une pause et ne touche a aucun profil si Gemini echoue', async () => {
    const alice = employee({
      id: 'alice@example.com',
      chatSpaceName: 'spaces/alice',
      interestAnswers: [buildAnswerId('cuisine', '1')],
      status: 'active',
    });
    const generateWeeklyQuestions = vi.fn(() => Promise.reject(new Error('gemini down')));
    const sendDirectMessage = vi.fn(() => Promise.resolve());

    const { app, savedProfiles, savedQuestionSets } = createApp({
      employees: [alice],
      geminiQuestionGenerator: { generateWeeklyQuestions },
      chatNotifier: { sendDirectMessage },
    });

    const res = await weeklyReset(app);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paused');

    expect(savedQuestionSets).toHaveLength(1);
    expect(savedQuestionSets[0]?.status).toBe('paused');
    expect(savedQuestionSets[0]?.questions).toEqual([]);

    // Aucun profil touche - rien a regenerer, on garde l'etat tel quel.
    expect(savedProfiles).toHaveLength(0);

    expect(sendDirectMessage).toHaveBeenCalledWith(
      'spaces/alice',
      expect.stringContaining('pause'),
    );
  });

  it("un echec de diffusion pour un employe n'empeche pas d'annoncer les autres", async () => {
    const alice = employee({ id: 'alice@example.com', chatSpaceName: 'spaces/alice' });
    const bob = employee({ id: 'bob@example.com', chatSpaceName: 'spaces/bob' });
    const generateWeeklyQuestions = vi.fn(() => Promise.resolve(TEST_QUESTIONS));
    const sendDirectMessage = vi.fn((spaceName: string) =>
      spaceName === 'spaces/alice' ? Promise.reject(new Error('down')) : Promise.resolve(),
    );

    const { app } = createApp({
      employees: [alice, bob],
      geminiQuestionGenerator: { generateWeeklyQuestions },
      chatNotifier: { sendDirectMessage },
    });

    const res = await weeklyReset(app);

    expect(res.status).toBe(200);
    expect(sendDirectMessage).toHaveBeenCalledTimes(2);
  });
});
