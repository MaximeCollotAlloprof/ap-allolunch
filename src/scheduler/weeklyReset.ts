import type { Request, Response } from 'express';
import { Router } from 'express';
import { logger } from '../logger.js';
import type { EmployeeRepository } from '../db/repositories/employeeRepository.js';
import type { WeeklyQuestionSetRepository } from '../db/repositories/weeklyQuestionSetRepository.js';
import type { GeminiQuestionGenerator } from '../ai/geminiQuestionGenerator.js';
import type { ChatNotifier } from '../chat/chatNotifier.js';
import { INTEREST_CATEGORIES, type EmployeeProfile } from '../domain/types.js';

export interface WeeklyResetDeps {
  employeeRepository: EmployeeRepository;
  weeklyQuestionSetRepository: WeeklyQuestionSetRepository;
  geminiQuestionGenerator: GeminiQuestionGenerator;
  chatNotifier: ChatNotifier;
}

const NEW_WEEK_MESSAGE = 'Nouvelle semaine AlloLunch ! Tape /rejoindre pour participer.';
const PAUSED_WEEK_MESSAGE =
  'AlloLunch fait une pause cette semaine ! On se retrouve la semaine prochaine.';

async function broadcast(
  employees: readonly EmployeeProfile[],
  chatNotifier: ChatNotifier,
  text: string,
): Promise<void> {
  for (const employee of employees) {
    if (!employee.chatSpaceName) continue;
    try {
      await chatNotifier.sendDirectMessage(employee.chatSpaceName, text);
    } catch (error) {
      logger.error({ err: error, employeeId: employee.id }, 'failed to broadcast weekly message');
    }
  }
}

/** Remet a zero le profil hebdomadaire d'un employe, en gardant son identite/statut Chat. */
function resetProfileForNewWeek(profile: EmployeeProfile): EmployeeProfile {
  const next: EmployeeProfile = {
    ...profile,
    status: 'paused',
    interestAnswers: [],
    availableDays: [],
    interestsQuestionnaireActive: false,
    awaitingAvailability: false,
    interestsSkippedCategories: [],
    updatedAt: new Date(),
  };
  delete next.interestsEditingCategory;
  return next;
}

/**
 * Route appelee chaque lundi matin par Cloud Scheduler. Genere les nouvelles questions
 * via Gemini (src/ai/geminiQuestionGenerator.ts) puis remet a zero le profil hebdomadaire
 * de tous les employes connus (garde l'identite/le statut Chat). Si Gemini echoue ou
 * renvoie un format invalide: aucune reparation automatique - la semaine est annoncee en
 * pause et rien n'est efface (pas de nouvelle question a distribuer de toute facon).
 */
export function createWeeklyResetRouter(deps: WeeklyResetDeps): Router {
  const router = Router();

  router.post('/scheduler/weekly-reset', async (_req: Request, res: Response) => {
    const weekId = new Date().toISOString().slice(0, 10);
    const employees = await deps.employeeRepository.listAll();

    try {
      const questions =
        await deps.geminiQuestionGenerator.generateWeeklyQuestions(INTEREST_CATEGORIES);

      await deps.weeklyQuestionSetRepository.set({
        weekId,
        status: 'ready',
        generatedAt: new Date(),
        questions,
      });

      for (const employee of employees) {
        await deps.employeeRepository.upsert(resetProfileForNewWeek(employee));
      }

      await broadcast(employees, deps.chatNotifier, NEW_WEEK_MESSAGE);

      logger.info({ weekId, employeeCount: employees.length }, 'weekly reset completed');
      res.json({ weekId, status: 'ready', employeeCount: employees.length });
    } catch (error) {
      logger.error({ err: error, weekId }, 'weekly reset failed - gemini generation error');

      await deps.weeklyQuestionSetRepository.set({
        weekId,
        status: 'paused',
        generatedAt: new Date(),
        questions: [],
      });

      await broadcast(employees, deps.chatNotifier, PAUSED_WEEK_MESSAGE);

      res.json({ weekId, status: 'paused' });
    }
  });

  return router;
}
