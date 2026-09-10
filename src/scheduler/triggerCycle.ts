import type { Request, Response } from 'express';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { formMatchGroups } from '../matching/engine.js';
import { logger } from '../logger.js';
import type { EmployeeRepository } from '../db/repositories/employeeRepository.js';
import type { MatchHistoryRepository } from '../db/repositories/matchHistoryRepository.js';
import type { MatchGroup } from '../domain/types.js';

export interface TriggerCycleDeps {
  employeeRepository: EmployeeRepository;
  matchHistoryRepository: MatchHistoryRepository;
  matchHistoryWindowCycles: number;
}

/**
 * Route appelee par Cloud Scheduler (hebdomadaire). Protegee en production par
 * l'en-tete OIDC que Cloud Scheduler ajoute automatiquement a ses requetes.
 */
export function createTriggerCycleRouter(deps: TriggerCycleDeps): Router {
  const router = Router();

  router.post('/scheduler/trigger-cycle', async (_req: Request, res: Response) => {
    const cycleId = randomUUID();
    const employees = await deps.employeeRepository.listActive();
    const recentPairs = await deps.matchHistoryRepository.getRecentPairs(
      deps.matchHistoryWindowCycles,
    );

    const { groups, deferred } = formMatchGroups(
      employees.map((e) => ({ employeeId: e.id, interestTags: e.interestTags })),
      recentPairs,
    );

    const matchGroups: MatchGroup[] = groups.map((employeeIds) => ({
      id: randomUUID(),
      cycleId,
      employeeIds,
      createdAt: new Date(),
    }));

    await deps.matchHistoryRepository.saveGroups(matchGroups);

    logger.info(
      { cycleId, groupCount: matchGroups.length, deferredCount: deferred.length },
      'match cycle completed',
    );

    // TODO (lot 1 + lot 3): pour chaque groupe, notifier via Google Chat et creer
    // l'invitation Calendar (calendarService.createLunchEvent).

    res.json({ cycleId, groupCount: matchGroups.length, deferredCount: deferred.length });
  });

  return router;
}
