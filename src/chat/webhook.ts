import type { Request, Response } from 'express';
import { Router } from 'express';
import { logger } from '../logger.js';
import type { EmployeeRepository } from '../db/repositories/employeeRepository.js';
import type { WeeklyQuestionSetRepository } from '../db/repositories/weeklyQuestionSetRepository.js';
import type { DayOfWeek, EmployeeProfile, WeeklyQuestion } from '../domain/types.js';
import { createGoogleChatTokenVerifier, type BearerTokenVerifier } from './auth.js';
import {
  findNextQuestion,
  formatEditPrompt,
  formatInterestsEditList,
  formatQuestionPrompt,
  getCurrentAnswer,
  getDisplayInterestLabels,
  getQuestionByCategory,
  getQuestionByIndex,
  removeAnswerForCategory,
} from './interestsQuestionnaire.js';

export interface ChatCommandContext {
  employeeId: string;
  displayName: string;
  argument?: string;
  /** Nom de la ressource Chat (`spaces/xxx`) du DM courant, si connu. */
  spaceName?: string;
}

export type ChatCommandHandler = (ctx: ChatCommandContext) => Promise<string>;

export const DAYS_OF_WEEK: readonly DayOfWeek[] = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
];

const NO_PROFILE_MESSAGE =
  "Tu n'as pas encore de profil AlloLunch. Tape /rejoindre pour commencer.";
const PAUSED_WEEK_MESSAGE =
  'AlloLunch fait une pause cette semaine ! On se retrouve la semaine prochaine.';
const AVAILABILITY_PROMPT = `Quels jours es-tu disponible cette semaine ? Reponds avec tes jours separes par des virgules parmi: ${DAYS_OF_WEEK.join(', ')}.\nEx: lundi,mercredi`;

/**
 * Retire interestsEditingCategory du profil - Firestore rejette un champ explicitement
 * `undefined` (contrairement a une cle simplement absente), `delete` est donc necessaire
 * plutot que `{ ...profile, interestsEditingCategory: undefined }`.
 */
function withoutEditingCategory(profile: EmployeeProfile): EmployeeProfile {
  const next: EmployeeProfile = { ...profile };
  delete next.interestsEditingCategory;
  return next;
}

function formatProfile(profile: EmployeeProfile, questions: readonly WeeklyQuestion[]): string {
  const interestLabels = getDisplayInterestLabels(questions, profile.interestAnswers);
  const interests = interestLabels.length > 0 ? interestLabels.join(', ') : 'aucun';
  const days = profile.availableDays.length > 0 ? profile.availableDays.join(', ') : 'aucune';
  const status = profile.status === 'active' ? 'actif' : 'en pause';
  return [
    `Profil de ${profile.displayName}`,
    `Statut: ${status}`,
    `Centres d'interet: ${interests}`,
    `Disponibilites: ${days}`,
  ].join('\n');
}

/** Parse une liste texte separee par des virgules et valide chaque valeur contre `allowed`. */
function parseTaggedList<T extends string>(
  argument: string | undefined,
  allowed: readonly T[],
): { values: T[]; invalid: string[] } {
  const items = (argument ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);

  const values: T[] = [];
  const invalid: string[] = [];
  const allowedSet = new Set<string>(allowed);

  for (const item of items) {
    if (allowedSet.has(item)) {
      values.push(item as T);
    } else {
      invalid.push(item);
    }
  }

  return { values, invalid: [...new Set(invalid)] };
}

export const HELP_MESSAGE = [
  'Commandes disponibles:',
  '/rejoindre - participe au cycle AlloLunch de cette semaine (a refaire chaque semaine)',
  '/pause - suspend ta participation cette semaine',
  "/interets - repond aux questions de la semaine pour affiner tes centres d'interet",
  '/interets modifier - liste tes reponses et permet de changer une reponse',
  '/interets supprimer <numero> - efface la reponse de cette categorie',
  `/disponibilites <jours separes par des virgules> - definit tes jours disponibles (${DAYS_OF_WEEK.join(', ')})`,
  '/profil - affiche ton profil actuel',
  '/aide - affiche ce message',
].join('\n');

export interface ChatCommandDeps {
  employeeRepository: EmployeeRepository;
  weeklyQuestionSetRepository: WeeklyQuestionSetRepository;
  /** Injectable pour des tests deterministes - ordre aleatoire des questions /interets. */
  random?: () => number;
}

/** Jeu de questions de la semaine, ou [] si aucune semaine active (pause) - jamais throw. */
async function getCurrentQuestions(
  weeklyQuestionSetRepository: WeeklyQuestionSetRepository,
): Promise<readonly WeeklyQuestion[]> {
  const questionSet = await weeklyQuestionSetRepository.get();
  return questionSet?.status === 'ready' ? questionSet.questions : [];
}

export function createCommandHandlers(deps: ChatCommandDeps): Record<string, ChatCommandHandler> {
  const { employeeRepository, weeklyQuestionSetRepository, random } = deps;

  return {
    '/aide': () => Promise.resolve(HELP_MESSAGE),

    '/rejoindre': async (ctx) => {
      const questionSet = await weeklyQuestionSetRepository.get();
      if (!questionSet || questionSet.status === 'paused') {
        return PAUSED_WEEK_MESSAGE;
      }

      const now = new Date();
      const existing = await employeeRepository.findById(ctx.employeeId);

      const profile: EmployeeProfile = existing
        ? {
            ...existing,
            status: 'active',
            displayName: ctx.displayName,
            updatedAt: now,
            ...(ctx.spaceName ? { chatSpaceName: ctx.spaceName } : {}),
          }
        : {
            id: ctx.employeeId,
            displayName: ctx.displayName,
            status: 'active',
            interestAnswers: [],
            availableDays: [],
            interestsQuestionnaireActive: false,
            awaitingAvailability: false,
            createdAt: now,
            updatedAt: now,
            ...(ctx.spaceName ? { chatSpaceName: ctx.spaceName } : {}),
          };

      // Nouvelle semaine (ou premiere fois) pour cet employe: on redemande toujours les
      // disponibilites avant les questions - garanti d'etre la premiere chose demandee.
      if (profile.availableDays.length === 0) {
        await employeeRepository.upsert({ ...profile, awaitingAvailability: true });
        return `Bienvenue ${ctx.displayName} ! ${AVAILABILITY_PROMPT}`;
      }

      await employeeRepository.upsert(profile);
      return existing
        ? `Bon retour ${ctx.displayName} ! Ton profil est de nouveau actif pour cette semaine.`
        : `Bienvenue ${ctx.displayName} !`;
    },

    '/pause': async (ctx) => {
      const existing = await employeeRepository.findById(ctx.employeeId);
      if (!existing) return NO_PROFILE_MESSAGE;

      await employeeRepository.setStatus(ctx.employeeId, 'paused');
      return 'Ton profil est maintenant en pause pour cette semaine. Tape /rejoindre pour redevenir actif.';
    },

    '/profil': async (ctx) => {
      const profile = await employeeRepository.findById(ctx.employeeId);
      if (!profile) return NO_PROFILE_MESSAGE;

      const questions = await getCurrentQuestions(weeklyQuestionSetRepository);
      return formatProfile(profile, questions);
    },

    '/interets': async (ctx) => {
      const profile = await employeeRepository.findById(ctx.employeeId);
      if (!profile) return NO_PROFILE_MESSAGE;

      const questions = await getCurrentQuestions(weeklyQuestionSetRepository);
      if (questions.length === 0) return PAUSED_WEEK_MESSAGE;

      const [action, indexRaw] = (ctx.argument ?? '').trim().toLowerCase().split(/\s+/);

      if (action === 'modifier' && !indexRaw) {
        return formatInterestsEditList(questions, profile.interestAnswers);
      }

      if (action === 'modifier' && indexRaw) {
        const question = getQuestionByIndex(questions, Number.parseInt(indexRaw, 10));
        if (!question) {
          return 'Numero invalide. Tape /interets modifier pour voir la liste des categories.';
        }
        await employeeRepository.upsert({
          ...profile,
          interestsEditingCategory: question.category,
          updatedAt: new Date(),
        });
        const current = getCurrentAnswer(question, profile.interestAnswers);
        return formatEditPrompt(question, current?.label);
      }

      if (action === 'supprimer' && indexRaw) {
        const question = getQuestionByIndex(questions, Number.parseInt(indexRaw, 10));
        if (!question) {
          return 'Numero invalide. Tape /interets modifier pour voir la liste des categories.';
        }
        const updatedAnswers = removeAnswerForCategory(profile.interestAnswers, question.category);
        await employeeRepository.upsert({
          ...profile,
          interestAnswers: updatedAnswers,
          updatedAt: new Date(),
        });
        return `Reponse supprimee pour ${question.categoryLabel}. Tape /interets modifier pour voir ton profil.`;
      }

      if (action) {
        return 'Argument non reconnu. Tape /interets, /interets modifier ou /interets supprimer <numero>.';
      }

      // /interets sans argument: reprend le questionnaire sequentiel a la prochaine
      // question sans reponse. Une modification en cours (/interets modifier <n>) est
      // abandonnee pour eviter d'interpreter la prochaine reponse au mauvais endroit.
      const nextQuestion = findNextQuestion(
        questions,
        profile.interestAnswers,
        profile.interestsSkippedCategories ?? [],
        random,
      );
      if (!nextQuestion) {
        if (profile.interestsQuestionnaireActive || profile.interestsEditingCategory) {
          await employeeRepository.upsert({
            ...withoutEditingCategory(profile),
            interestsQuestionnaireActive: false,
            updatedAt: new Date(),
          });
        }
        return "Ton profil de centres d'interet est deja complet ! Tape /profil pour le voir.";
      }

      await employeeRepository.upsert({
        ...withoutEditingCategory(profile),
        interestsQuestionnaireActive: true,
        updatedAt: new Date(),
      });
      return formatQuestionPrompt(nextQuestion);
    },

    '/disponibilites': async (ctx) => {
      const profile = await employeeRepository.findById(ctx.employeeId);
      if (!profile) return NO_PROFILE_MESSAGE;

      if (!ctx.argument) {
        return `Indique tes jours disponibles separes par des virgules parmi: ${DAYS_OF_WEEK.join(', ')}.\nEx: /disponibilites lundi,mercredi`;
      }

      const { values, invalid } = parseTaggedList(ctx.argument, DAYS_OF_WEEK);
      if (invalid.length > 0) {
        return `Jour(s) inconnu(s): ${invalid.join(', ')}.\nChoix valides: ${DAYS_OF_WEEK.join(', ')}`;
      }

      await employeeRepository.upsert({
        ...profile,
        availableDays: values,
        awaitingAvailability: false,
        updatedAt: new Date(),
      });
      return `Disponibilites mises a jour: ${values.join(', ') || 'aucune'}.`;
    },
  };
}

/**
 * Traite un message texte brut (pas une commande) comme la reponse de disponibilites
 * attendue juste apres /rejoindre pour une nouvelle semaine - appele uniquement quand
 * `profile.awaitingAvailability` est vrai (voir createChatWebhookRouter). Enchaine
 * immediatement sur la premiere question generee, sans attendre /interets.
 */
async function handleAvailabilityAnswer(
  employeeRepository: EmployeeRepository,
  weeklyQuestionSetRepository: WeeklyQuestionSetRepository,
  profile: EmployeeProfile,
  rawAnswer: string,
  random: (() => number) | undefined,
): Promise<string> {
  const { values, invalid } = parseTaggedList(rawAnswer, DAYS_OF_WEEK);
  if (invalid.length > 0 || values.length === 0) {
    return `Jour(s) invalide(s). ${AVAILABILITY_PROMPT}`;
  }

  const questions = await getCurrentQuestions(weeklyQuestionSetRepository);
  const nextQuestion = findNextQuestion(
    questions,
    profile.interestAnswers,
    profile.interestsSkippedCategories ?? [],
    random,
  );

  await employeeRepository.upsert({
    ...profile,
    availableDays: values,
    awaitingAvailability: false,
    interestsQuestionnaireActive: !!nextQuestion,
    updatedAt: new Date(),
  });

  const daysText = `Disponibilites enregistrees: ${values.join(', ')}.`;
  if (!nextQuestion) {
    return `${daysText}\n\nAucune question a repondre pour le moment.`;
  }
  return `${daysText}\n\n${formatQuestionPrompt(nextQuestion)}`;
}

/**
 * Traite un message texte brut (pas une commande) comme une reponse au questionnaire
 * /interets en cours - appele uniquement quand `profile.interestsQuestionnaireActive`
 * est vrai (voir createChatWebhookRouter).
 */
async function handleInterestsAnswer(
  employeeRepository: EmployeeRepository,
  weeklyQuestionSetRepository: WeeklyQuestionSetRepository,
  profile: EmployeeProfile,
  rawAnswer: string,
  random: (() => number) | undefined,
): Promise<string> {
  const questions = await getCurrentQuestions(weeklyQuestionSetRepository);
  const skipped = profile.interestsSkippedCategories ?? [];
  const question = findNextQuestion(questions, profile.interestAnswers, skipped, random);
  if (!question) {
    await employeeRepository.upsert({
      ...profile,
      interestsQuestionnaireActive: false,
      updatedAt: new Date(),
    });
    return "Ton profil de centres d'interet est deja complet ! Tape /profil pour le voir.";
  }

  const trimmed = rawAnswer.trim();

  if (trimmed === '0') {
    const updatedSkipped = [...new Set([...skipped, question.category])];
    const nextQuestion = findNextQuestion(
      questions,
      profile.interestAnswers,
      updatedSkipped,
      random,
    );

    await employeeRepository.upsert({
      ...profile,
      interestsSkippedCategories: updatedSkipped,
      interestsQuestionnaireActive: !!nextQuestion,
      updatedAt: new Date(),
    });

    if (!nextQuestion) {
      return "Question passee.\n\nTon profil de centres d'interet est complet ! Tape /profil pour le voir.";
    }
    return `Question passee.\n\n${formatQuestionPrompt(nextQuestion)}`;
  }

  const choiceIndex = Number.parseInt(trimmed, 10) - 1;
  const selected =
    Number.isInteger(choiceIndex) && trimmed !== '' ? question.options[choiceIndex] : undefined;
  if (!selected) {
    return `Reponse invalide.\n\n${formatQuestionPrompt(question)}`;
  }

  const updatedAnswers = [
    ...removeAnswerForCategory(profile.interestAnswers, question.category),
    `${question.category}:${selected.id}`,
  ];
  const nextQuestion = findNextQuestion(questions, updatedAnswers, skipped, random);

  await employeeRepository.upsert({
    ...profile,
    interestAnswers: updatedAnswers,
    interestsQuestionnaireActive: !!nextQuestion,
    updatedAt: new Date(),
  });

  if (!nextQuestion) {
    return `Enregistre : ${selected.label}.\n\nTon profil de centres d'interet est complet ! Tape /profil pour le voir.`;
  }
  return `Enregistre : ${selected.label}.\n\n${formatQuestionPrompt(nextQuestion)}`;
}

/**
 * Traite un message texte brut comme une reponse a une modification ciblee en cours
 * (/interets modifier <numero>) - appele en priorite sur handleInterestsAnswer quand
 * `profile.interestsEditingCategory` est defini (voir createChatWebhookRouter).
 */
async function handleCategoryEditAnswer(
  employeeRepository: EmployeeRepository,
  weeklyQuestionSetRepository: WeeklyQuestionSetRepository,
  profile: EmployeeProfile,
  rawAnswer: string,
): Promise<string> {
  const questions = await getCurrentQuestions(weeklyQuestionSetRepository);
  const question = profile.interestsEditingCategory
    ? getQuestionByCategory(questions, profile.interestsEditingCategory)
    : undefined;
  if (!question) {
    await employeeRepository.upsert({
      ...withoutEditingCategory(profile),
      updatedAt: new Date(),
    });
    return 'Rien a modifier pour le moment. Tape /interets pour continuer ton profil.';
  }

  const trimmed = rawAnswer.trim();
  if (trimmed === '0') {
    await employeeRepository.upsert({
      ...withoutEditingCategory(profile),
      updatedAt: new Date(),
    });
    return 'Modification annulee.';
  }

  const choiceIndex = Number.parseInt(trimmed, 10) - 1;
  const selected =
    Number.isInteger(choiceIndex) && trimmed !== '' ? question.options[choiceIndex] : undefined;
  if (!selected) {
    const current = getCurrentAnswer(question, profile.interestAnswers);
    return `Reponse invalide.\n\n${formatEditPrompt(question, current?.label)}`;
  }

  const updatedAnswers = [
    ...removeAnswerForCategory(profile.interestAnswers, question.category),
    `${question.category}:${selected.id}`,
  ];

  await employeeRepository.upsert({
    ...withoutEditingCategory(profile),
    interestAnswers: updatedAnswers,
    updatedAt: new Date(),
  });

  return `Mis a jour: ${question.categoryLabel}: ${selected.label}.`;
}

export interface ChatWebhookDeps extends ChatCommandDeps {
  chatWebhookUrl: string;
  /** Injectable pour les tests - par defaut verifie le token via Google (google-auth-library). */
  verifyBearerToken?: BearerTokenVerifier;
}

/**
 * Les apps Chat construites via le framework Google Workspace Add-ons (endpoint HTTP
 * configure dans la console Google Chat API) attendent une DataActions en reponse a un
 * appCommandPayload, pas un simple Message `{ text }` - sinon Google Chat affiche
 * "L'app ne repond pas" malgre un 200 OK. Cf. https://developers.google.com/workspace/add-ons/chat/build
 */
function sendChatReply(res: Response, text: string, status = 200): void {
  res.status(status).json({
    hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text } } } },
  });
}

export function createChatWebhookRouter(deps: ChatWebhookDeps): Router {
  const router = Router();
  const { employeeRepository, weeklyQuestionSetRepository, random } = deps;
  const commandHandlers = createCommandHandlers(deps);
  const verifyBearerToken =
    deps.verifyBearerToken ?? createGoogleChatTokenVerifier(deps.chatWebhookUrl);

  router.post('/chat/webhook', async (req: Request, res: Response) => {
    const isVerified = await verifyBearerToken(req.headers.authorization);
    if (!isVerified) {
      sendChatReply(res, 'Requete non autorisee.', 401);
      return;
    }

    type ChatMessage = { text?: string; sender?: { email?: string; displayName?: string } };
    type ChatEventPayload = { message?: ChatMessage; space?: { name?: string } };
    const event = req.body as {
      chat?: {
        appCommandPayload?: ChatEventPayload;
        messagePayload?: ChatEventPayload;
      };
    };
    const payload = event.chat?.appCommandPayload ?? event.chat?.messagePayload;
    const message = payload?.message;
    const spaceName = payload?.space?.name;
    const text = message?.text?.trim() ?? '';
    const senderEmail = message?.sender?.email;

    try {
      // Un message texte brut (pas une commande) est interprete, dans l'ordre de
      // priorite: disponibilites attendues (nouvelle semaine) -> modification ciblee
      // (/interets modifier <numero>) -> progression sequentielle normale du
      // questionnaire.
      if (senderEmail && !text.startsWith('/')) {
        const profile = await employeeRepository.findById(senderEmail);
        if (profile?.awaitingAvailability) {
          const reply = await handleAvailabilityAnswer(
            employeeRepository,
            weeklyQuestionSetRepository,
            profile,
            text,
            random,
          );
          sendChatReply(res, reply);
          return;
        }
        if (profile?.interestsEditingCategory) {
          const reply = await handleCategoryEditAnswer(
            employeeRepository,
            weeklyQuestionSetRepository,
            profile,
            text,
          );
          sendChatReply(res, reply);
          return;
        }
        if (profile?.interestsQuestionnaireActive) {
          const reply = await handleInterestsAnswer(
            employeeRepository,
            weeklyQuestionSetRepository,
            profile,
            text,
            random,
          );
          sendChatReply(res, reply);
          return;
        }
      }

      const [command, ...rest] = text.split(/\s+/);
      const handler = command ? commandHandlers[command] : undefined;
      if (!handler || !senderEmail) {
        sendChatReply(
          res,
          `Commande inconnue. Tapez /aide pour la liste des commandes.\n\n${HELP_MESSAGE}`,
        );
        return;
      }

      const argument = rest.join(' ');
      const reply = await handler({
        employeeId: senderEmail,
        displayName: message?.sender?.displayName ?? senderEmail,
        ...(argument ? { argument } : {}),
        ...(spaceName ? { spaceName } : {}),
      });
      sendChatReply(res, reply);
    } catch (error) {
      logger.error({ err: error }, 'chat command failed');
      sendChatReply(res, 'Une erreur est survenue, reessayez plus tard.', 500);
    }
  });

  return router;
}
