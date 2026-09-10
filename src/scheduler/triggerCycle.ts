import type { Request, Response } from 'express';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { formMatchGroups } from '../matching/engine.js';
import { findCommonAvailableDay, nextDateForDayOfWeek } from '../calendar/scheduling.js';
import type { CalendarService } from '../calendar/calendarService.js';
import type { ChatNotifier } from '../chat/chatNotifier.js';
import { computeSharedAnswers, type SharedInterestAnswer } from '../chat/interestsQuestionnaire.js';
import { logger } from '../logger.js';
import type { EmployeeRepository } from '../db/repositories/employeeRepository.js';
import type { MatchHistoryRepository } from '../db/repositories/matchHistoryRepository.js';
import type { MatchCycleRepository } from '../db/repositories/matchCycleRepository.js';
import type { WeeklyQuestionSetRepository } from '../db/repositories/weeklyQuestionSetRepository.js';
import type { EmployeeProfile, MatchGroup, WeeklyQuestion } from '../domain/types.js';

export interface TriggerCycleDeps {
  employeeRepository: EmployeeRepository;
  matchHistoryRepository: MatchHistoryRepository;
  matchCycleRepository: MatchCycleRepository;
  weeklyQuestionSetRepository: WeeklyQuestionSetRepository;
  matchHistoryWindowCycles: number;
  calendarService: CalendarService;
  chatNotifier: ChatNotifier;
}

function formatMatchNotification(
  others: EmployeeProfile[],
  proposedDate: Date | undefined,
  sharedAnswers: readonly SharedInterestAnswer[],
): string {
  const names = others.map((o) => o.displayName).join(', ');
  const dateText = proposedDate
    ? `On propose ${proposedDate.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })} a midi - une invitation Calendar arrive.`
    : "On n'a pas trouve de jour commun automatiquement - organisez-vous directement !";
  const sharedText =
    sharedAnswers.length > 0
      ? `\nVous avez en commun:\n${sharedAnswers.map((a) => `${a.categoryLabel}: ${a.answerLabel}`).join('\n')}`
      : '';
  return `It's a match! Tu as un rendez-vous pour un diner AlloLunch avec ${names} !${sharedText}\n${dateText}`;
}

/**
 * Pour chaque groupe: propose un creneau (premier jour commun), cree l'invitation
 * Calendar si possible, et notifie chaque membre par Chat. Les echecs (Calendar/Chat)
 * sont loggues mais ne font pas echouer le cycle - la formation des groupes et leur
 * persistance restent la source de verite.
 */
async function notifyGroups(
  deps: TriggerCycleDeps,
  matchGroups: MatchGroup[],
  employeesById: ReadonlyMap<string, EmployeeProfile>,
  startedAt: Date,
  questions: readonly WeeklyQuestion[],
): Promise<void> {
  for (const group of matchGroups) {
    const members = group.employeeIds
      .map((id) => employeesById.get(id))
      .filter((m): m is EmployeeProfile => !!m);

    const commonDay = findCommonAvailableDay(members.map((m) => m.availableDays));
    const proposedDate = commonDay ? nextDateForDayOfWeek(commonDay, startedAt) : undefined;

    if (proposedDate) {
      try {
        const { eventId } = await deps.calendarService.createLunchEvent({
          attendeeEmails: members.map((m) => m.id),
          proposedDate,
          matchGroupId: group.id,
        });
        group.calendarEventId = eventId;
      } catch (error) {
        logger.error(
          { err: error, groupId: group.id },
          'failed to create calendar event for group',
        );
      }
    } else {
      logger.warn(
        { groupId: group.id },
        'no common available day for group, skipping calendar event',
      );
    }

    const sharedAnswers = computeSharedAnswers(
      questions,
      members.map((m) => m.interestAnswers),
    );

    for (const member of members) {
      if (!member.chatSpaceName) continue;
      const others = members.filter((m) => m.id !== member.id);
      try {
        await deps.chatNotifier.sendDirectMessage(
          member.chatSpaceName,
          formatMatchNotification(others, proposedDate, sharedAnswers),
        );
      } catch (error) {
        logger.error(
          { err: error, employeeId: member.id, groupId: group.id },
          'failed to notify employee of match',
        );
      }
    }
  }
}

/**
 * Route appelee par Cloud Scheduler (hebdomadaire). Protegee en production par
 * l'en-tete OIDC que Cloud Scheduler ajoute automatiquement a ses requetes.
 */
export function createTriggerCycleRouter(deps: TriggerCycleDeps): Router {
  const router = Router();

  router.post('/scheduler/trigger-cycle', async (_req: Request, res: Response) => {
    const questionSet = await deps.weeklyQuestionSetRepository.get();
    if (!questionSet || questionSet.status === 'paused') {
      logger.info({ weekId: questionSet?.weekId }, 'skipping match cycle - week is paused');
      res.json({ status: 'paused', groupCount: 0, deferredCount: 0 });
      return;
    }
    const questions = questionSet.questions;

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
        employees.map((e) => ({ employeeId: e.id, interestAnswers: e.interestAnswers })),
        recentPairs,
      );

      const matchGroups: MatchGroup[] = groups.map((employeeIds) => ({
        id: randomUUID(),
        cycleId,
        cycleIndex,
        employeeIds,
        createdAt: new Date(),
      }));

      const employeesById = new Map(employees.map((e) => [e.id, e]));
      await notifyGroups(deps, matchGroups, employeesById, startedAt, questions);

      await deps.matchHistoryRepository.saveGroups(matchGroups);
      await deps.matchCycleRepository.markCompleted(cycleId);

      logger.info(
        { cycleId, groupCount: matchGroups.length, deferredCount: deferred.length },
        'match cycle completed',
      );

      res.json({ cycleId, groupCount: matchGroups.length, deferredCount: deferred.length });
    } catch (error) {
      // Le cycle reste en statut "pending" en cas d'echec - il pourra etre inspecte/relance
      // manuellement plutot que d'etre marque a tort comme "completed".
      logger.error({ err: error, cycleId }, 'match cycle failed');
      res.status(500).json({ text: 'Une erreur est survenue lors du cycle de matching.' });
    }
  });

  return router;
}
