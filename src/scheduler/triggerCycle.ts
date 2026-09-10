import type { Request, Response } from 'express';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { formMatchGroups } from '../matching/engine.js';
import { logger } from '../logger.js';
import type { EmployeeRepository } from '../db/repositories/employeeRepository.js';
import type { MatchHistoryRepository } from '../db/repositories/matchHistoryRepository.js';
import type { MatchCycleRepository } from '../db/repositories/matchCycleRepository.js';
import type { MatchGroup } from '../domain/types.js';

export interface TriggerCycleDeps {
  employeeRepository: EmployeeRepository;
  matchHistoryRepository: MatchHistoryRepository;
  matchCycleRepository: MatchCycleRepository;
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
    const startedAt = new Date();
    const latestCycleIndex = await deps.matchCycleRepository.getLatestCycleIndex();
    const cycleIndex = latestCycleIndex + 1;

    await deps.matchCycleRepository.create({
      id: cycleId,
      cycleIndex,
      startedAt,
      status: 'pending',
    });

    try {
      const employees = await deps.employeeRepository.listActive();
      const recentPairs = await deps.matchHistoryRepository.getRecentPairs(
        deps.matchHistoryWindowCycles,
        cycleIndex,
      );

      const { groups, deferred } = formMatchGroups(
        employees.map((e) => ({ employeeId: e.id, interestTags: e.interestTags })),
        recentPairs,
      );

      const matchGroups: MatchGroup[] = groups.map((employeeIds) => ({
        id: randomUUID(),
        cycleId,
        cycleIndex,
        employeeIds,
        createdAt: new Date(),
      }));

      await deps.matchHistoryRepository.saveGroups(matchGroups);
      await deps.matchCycleRepository.markCompleted(cycleId);

      logger.info(
        { cycleId, groupCount: matchGroups.length, deferredCount: deferred.length },
        'match cycle completed',
      );

      // TODO (lot 1 + lot 3): pour chaque groupe, notifier via Google Chat et creer
      // l'invitation Calendar (calendarService.createLunchEvent).

      res.json({ cycleId, groupCount: matchGroups.length, deferredCount: deferred.length });
    } catch (error) {
      // Le cycle reste en statut "pending" en cas d'echec - il pourra etre inspecte/relance
      // manuellement plutot que d'etre marque a tort comme "completed".
      logger.error({ error, cycleId }, 'match cycle failed');
      res.status(500).json({ text: 'Une erreur est survenue lors du cycle de matching.' });
    }
  });

  return router;
}
