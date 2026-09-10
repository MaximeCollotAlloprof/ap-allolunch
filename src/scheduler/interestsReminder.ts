import type { Request, Response } from 'express';
import { Router } from 'express';
import { findNextQuestion } from '../chat/interestsQuestionnaire.js';
import type { ChatNotifier } from '../chat/chatNotifier.js';
import { logger } from '../logger.js';
import type { EmployeeRepository } from '../db/repositories/employeeRepository.js';
import type { EmployeeProfile } from '../domain/types.js';

export interface InterestsReminderDeps {
  employeeRepository: EmployeeRepository;
  chatNotifier: ChatNotifier;
}

const REMINDER_MESSAGE =
  "Souhaites-tu continuer a mettre a jour ton profil ? Tape /interets pour repondre a une nouvelle question sur tes centres d'interet.";

/**
 * Route appelee periodiquement par Cloud Scheduler (ex: hebdomadaire) pour relancer les
 * employes actifs qui n'ont pas termine le questionnaire /interets. Aucune penalite ni
 * limite de rappels - un simple message, coherent avec les autres rappels du bot
 * (cf. CLAUDE.md). Protegee en production par l'en-tete OIDC de Cloud Scheduler, comme
 * /scheduler/trigger-cycle.
 */
export function createInterestsReminderRouter(deps: InterestsReminderDeps): Router {
  const router = Router();

  router.post('/scheduler/interests-reminder', async (_req: Request, res: Response) => {
    const employees = await deps.employeeRepository.listActive();
    const incomplete = employees.filter(
      (e): e is EmployeeProfile & { chatSpaceName: string } =>
        !!e.chatSpaceName && findNextQuestion(e.interestTags) !== undefined,
    );

    let remindedCount = 0;
    for (const employee of incomplete) {
      try {
        await deps.chatNotifier.sendDirectMessage(employee.chatSpaceName, REMINDER_MESSAGE);
        remindedCount++;
      } catch (error) {
        logger.error(
          { err: error, employeeId: employee.id },
          'failed to send interests reminder to employee',
        );
      }
    }

    logger.info(
      { remindedCount, skippedCount: employees.length - incomplete.length },
      'interests reminder cycle completed',
    );

    res.json({ remindedCount });
  });

  return router;
}
