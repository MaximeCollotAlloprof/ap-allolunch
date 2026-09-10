import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type {
  EmployeeId,
  EmployeeProfile,
  MatchCycle,
  MatchGroup,
} from '../../src/domain/types.js';
import type { EmployeeRepository } from '../../src/db/repositories/employeeRepository.js';
import type { MatchHistoryRepository } from '../../src/db/repositories/matchHistoryRepository.js';
import type { MatchCycleRepository } from '../../src/db/repositories/matchCycleRepository.js';
import type { CalendarService, CreateLunchEventInput } from '../../src/calendar/calendarService.js';
import type { ChatNotifier } from '../../src/chat/chatNotifier.js';
import { createTriggerCycleRouter } from '../../src/scheduler/triggerCycle.js';

interface TriggerCycleResponse {
  status: number;
  body: { cycleId: string; groupCount: number; deferredCount: number };
}

async function triggerCycle(app: express.Express): Promise<TriggerCycleResponse> {
  const res: unknown = await request(app).post('/scheduler/trigger-cycle');
  return res as TriggerCycleResponse;
}

function createMockCalendarService(
  impl: (input: CreateLunchEventInput) => Promise<{ eventId: string }>,
) {
  return vi.fn(impl);
}

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

function createMatchHistoryRepository(savedGroups: MatchGroup[]): MatchHistoryRepository {
  return {
    getRecentPairs: () => Promise.resolve(new Set()),
    saveGroups: (groups) => {
      savedGroups.push(...groups);
      return Promise.resolve();
    },
  };
}

function createMatchCycleRepository(savedCycles: MatchCycle[]): MatchCycleRepository {
  return {
    create: (cycle) => {
      savedCycles.push(cycle);
      return Promise.resolve();
    },
    markCompleted: (id) => {
      const cycle = savedCycles.find((c) => c.id === id);
      if (cycle) cycle.status = 'completed';
      return Promise.resolve();
    },
    getLatestCycleIndex: () => Promise.resolve(savedCycles.length),
  };
}

function createApp(deps: {
  employees: EmployeeProfile[];
  calendarService: CalendarService;
  chatNotifier: ChatNotifier;
}) {
  const savedGroups: MatchGroup[] = [];
  const savedCycles: MatchCycle[] = [];
  const app = express();
  app.use(express.json());
  app.use(
    createTriggerCycleRouter({
      employeeRepository: createEmployeeRepository(deps.employees),
      matchHistoryRepository: createMatchHistoryRepository(savedGroups),
      matchCycleRepository: createMatchCycleRepository(savedCycles),
      matchHistoryWindowCycles: 4,
      calendarService: deps.calendarService,
      chatNotifier: deps.chatNotifier,
    }),
  );
  return { app, savedGroups, savedCycles };
}

describe('trigger-cycle', () => {
  it('cree un evenement Calendar et notifie chaque membre via Chat pour un jour commun', async () => {
    const alice = employee({
      id: 'alice@example.com',
      displayName: 'Alice',
      availableDays: ['mardi', 'jeudi'],
      chatSpaceName: 'spaces/alice',
    });
    const bob = employee({
      id: 'bob@example.com',
      displayName: 'Bob',
      availableDays: ['jeudi'],
      chatSpaceName: 'spaces/bob',
    });

    const createLunchEvent = createMockCalendarService(() =>
      Promise.resolve({ eventId: 'evt-123' }),
    );
    const sendDirectMessage = vi.fn(() => Promise.resolve());

    const { app, savedGroups } = createApp({
      employees: [alice, bob],
      calendarService: { createLunchEvent },
      chatNotifier: { sendDirectMessage },
    });

    const res = await triggerCycle(app);

    expect(res.status).toBe(200);
    expect(res.body.groupCount).toBe(1);

    expect(createLunchEvent).toHaveBeenCalledTimes(1);
    const callArgs = createLunchEvent.mock.calls[0]?.[0];
    expect(callArgs?.attendeeEmails.slice().sort()).toEqual([
      'alice@example.com',
      'bob@example.com',
    ]);
    expect(callArgs?.proposedDate.getDay()).toBe(4); // jeudi

    expect(sendDirectMessage).toHaveBeenCalledTimes(2);
    expect(sendDirectMessage).toHaveBeenCalledWith('spaces/alice', expect.stringContaining('Bob'));
    expect(sendDirectMessage).toHaveBeenCalledWith('spaces/bob', expect.stringContaining('Alice'));

    expect(savedGroups).toHaveLength(1);
    expect(savedGroups[0]?.calendarEventId).toBe('evt-123');
  });

  it("ne cree pas d'evenement Calendar et le signale dans le message si aucun jour n'est commun", async () => {
    const alice = employee({
      id: 'alice@example.com',
      availableDays: ['lundi'],
      chatSpaceName: 'spaces/alice',
    });
    const bob = employee({
      id: 'bob@example.com',
      availableDays: ['mardi'],
      chatSpaceName: 'spaces/bob',
    });

    const createLunchEvent = createMockCalendarService(() =>
      Promise.resolve({ eventId: 'evt-123' }),
    );
    const sendDirectMessage = vi.fn(() => Promise.resolve());

    const { savedGroups, app } = createApp({
      employees: [alice, bob],
      calendarService: { createLunchEvent },
      chatNotifier: { sendDirectMessage },
    });

    await triggerCycle(app);

    expect(createLunchEvent).not.toHaveBeenCalled();
    expect(savedGroups[0]?.calendarEventId).toBeUndefined();
    expect(sendDirectMessage).toHaveBeenCalledWith(
      'spaces/alice',
      expect.stringContaining('pas trouve de jour commun'),
    );
  });

  it("ignore les membres sans chatSpaceName connu (pas d'exception)", async () => {
    const alice = employee({ id: 'alice@example.com', availableDays: ['lundi'] }); // pas de chatSpaceName
    const bob = employee({
      id: 'bob@example.com',
      availableDays: ['lundi'],
      chatSpaceName: 'spaces/bob',
    });

    const createLunchEvent = createMockCalendarService(() => Promise.resolve({ eventId: 'evt-1' }));
    const sendDirectMessage = vi.fn(() => Promise.resolve());

    const { app } = createApp({
      employees: [alice, bob],
      calendarService: { createLunchEvent },
      chatNotifier: { sendDirectMessage },
    });

    const res = await triggerCycle(app);

    expect(res.status).toBe(200);
    expect(sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(sendDirectMessage).toHaveBeenCalledWith('spaces/bob', expect.any(String));
  });

  it("un echec Calendar ou Chat n'empeche pas le cycle de se terminer normalement", async () => {
    const alice = employee({
      id: 'alice@example.com',
      availableDays: ['lundi'],
      chatSpaceName: 'spaces/alice',
    });
    const bob = employee({
      id: 'bob@example.com',
      availableDays: ['lundi'],
      chatSpaceName: 'spaces/bob',
    });

    const createLunchEvent = createMockCalendarService(() =>
      Promise.reject(new Error('calendar down')),
    );
    const sendDirectMessage = vi.fn(() => Promise.reject(new Error('chat down')));

    const { app, savedGroups, savedCycles } = createApp({
      employees: [alice, bob],
      calendarService: { createLunchEvent },
      chatNotifier: { sendDirectMessage },
    });

    const res = await triggerCycle(app);

    expect(res.status).toBe(200);
    expect(res.body.groupCount).toBe(1);
    expect(savedGroups).toHaveLength(1);
    expect(savedGroups[0]?.calendarEventId).toBeUndefined();
    expect(savedCycles[0]?.status).toBe('completed');
  });
});
