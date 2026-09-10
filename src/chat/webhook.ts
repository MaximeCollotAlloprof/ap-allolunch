import type { Request, Response } from 'express';
import { Router } from 'express';
import { logger } from '../logger.js';
import type { EmployeeRepository } from '../db/repositories/employeeRepository.js';
import type { DayOfWeek, EmployeeProfile } from '../domain/types.js';
import { createGoogleChatTokenVerifier, type BearerTokenVerifier } from './auth.js';
import {
  findNextQuestion,
  formatQuestionPrompt,
  getDisplayInterestLabels,
} from './interestsQuestionnaire.js';

export interface ChatCommandContext {
  employeeId: string;
  displayName: string;
  argument?: string;
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

function formatProfile(profile: EmployeeProfile): string {
  const interestLabels = getDisplayInterestLabels(profile.interestTags);
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
  '/rejoindre - active ton profil AlloLunch (opt-in)',
  '/pause - suspend ta participation aux prochains cycles',
  "/interets - lance ou reprend le questionnaire pour affiner tes centres d'interet",
  `/disponibilites <jours separes par des virgules> - definit tes jours disponibles (${DAYS_OF_WEEK.join(', ')})`,
  '/profil - affiche ton profil actuel',
  '/aide - affiche ce message',
].join('\n');

export interface ChatCommandDeps {
  employeeRepository: EmployeeRepository;
}

export function createCommandHandlers(deps: ChatCommandDeps): Record<string, ChatCommandHandler> {
  const { employeeRepository } = deps;

  return {
    '/aide': () => Promise.resolve(HELP_MESSAGE),

    '/rejoindre': async (ctx) => {
      const now = new Date();
      const existing = await employeeRepository.findById(ctx.employeeId);

      const profile: EmployeeProfile = existing
        ? { ...existing, status: 'active', displayName: ctx.displayName, updatedAt: now }
        : {
            id: ctx.employeeId,
            displayName: ctx.displayName,
            status: 'active',
            interestTags: [],
            availableDays: [],
            interestsQuestionnaireActive: false,
            createdAt: now,
            updatedAt: now,
          };

      await employeeRepository.upsert(profile);

      return existing
        ? `Bon retour ${ctx.displayName} ! Ton profil est de nouveau actif.`
        : `Bienvenue ${ctx.displayName} ! Ton profil AlloLunch a ete cree. Complete-le avec /interets et /disponibilites.`;
    },

    '/pause': async (ctx) => {
      const existing = await employeeRepository.findById(ctx.employeeId);
      if (!existing) return NO_PROFILE_MESSAGE;

      await employeeRepository.setStatus(ctx.employeeId, 'paused');
      return 'Ton profil est maintenant en pause. Tape /rejoindre pour redevenir actif quand tu veux.';
    },

    '/profil': async (ctx) => {
      const profile = await employeeRepository.findById(ctx.employeeId);
      if (!profile) return NO_PROFILE_MESSAGE;

      return formatProfile(profile);
    },

    '/interets': async (ctx) => {
      const profile = await employeeRepository.findById(ctx.employeeId);
      if (!profile) return NO_PROFILE_MESSAGE;

      const nextQuestion = findNextQuestion(profile.interestTags);
      if (!nextQuestion) {
        if (profile.interestsQuestionnaireActive) {
          await employeeRepository.upsert({
            ...profile,
            interestsQuestionnaireActive: false,
            updatedAt: new Date(),
          });
        }
        return "Ton profil de centres d'interet est deja complet ! Tape /profil pour le voir.";
      }

      if (!profile.interestsQuestionnaireActive) {
        await employeeRepository.upsert({
          ...profile,
          interestsQuestionnaireActive: true,
          updatedAt: new Date(),
        });
      }
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

      await employeeRepository.upsert({ ...profile, availableDays: values, updatedAt: new Date() });
      return `Disponibilites mises a jour: ${values.join(', ') || 'aucune'}.`;
    },
  };
}

/**
 * Traite un message texte brut (pas une commande) comme une reponse au questionnaire
 * /interets en cours - appele uniquement quand `profile.interestsQuestionnaireActive`
 * est vrai (voir createChatWebhookRouter).
 */
async function handleInterestsAnswer(
  employeeRepository: EmployeeRepository,
  profile: EmployeeProfile,
  rawAnswer: string,
): Promise<string> {
  const question = findNextQuestion(profile.interestTags);
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
    await employeeRepository.upsert({
      ...profile,
      interestsQuestionnaireActive: false,
      updatedAt: new Date(),
    });
    return 'Questionnaire mis en pause. Tape /interets quand tu veux reprendre.';
  }

  const choiceIndex = Number.parseInt(trimmed, 10) - 1;
  const selected =
    Number.isInteger(choiceIndex) && trimmed !== '' ? question.options[choiceIndex] : undefined;
  if (!selected) {
    return `Reponse invalide.\n\n${formatQuestionPrompt(question)}`;
  }

  const updatedTags = [...new Set([...profile.interestTags, question.category, selected.tag])];
  const nextQuestion = findNextQuestion(updatedTags);

  await employeeRepository.upsert({
    ...profile,
    interestTags: updatedTags,
    interestsQuestionnaireActive: !!nextQuestion,
    updatedAt: new Date(),
  });

  if (!nextQuestion) {
    return `Enregistre : ${selected.label}.\n\nTon profil de centres d'interet est complet ! Tape /profil pour le voir.`;
  }
  return `Enregistre : ${selected.label}.\n\n${formatQuestionPrompt(nextQuestion)}`;
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
  const { employeeRepository } = deps;
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
    const event = req.body as {
      chat?: {
        appCommandPayload?: { message?: ChatMessage };
        messagePayload?: { message?: ChatMessage };
      };
    };
    const message = event.chat?.appCommandPayload?.message ?? event.chat?.messagePayload?.message;
    const text = message?.text?.trim() ?? '';
    const senderEmail = message?.sender?.email;

    try {
      // Un message texte brut (pas une commande) pendant un questionnaire /interets en
      // cours est interprete comme une reponse (numero de choix, ou 0 pour arreter).
      if (senderEmail && !text.startsWith('/')) {
        const profile = await employeeRepository.findById(senderEmail);
        if (profile?.interestsQuestionnaireActive) {
          const reply = await handleInterestsAnswer(employeeRepository, profile, text);
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
      });
      sendChatReply(res, reply);
    } catch (error) {
      logger.error({ err: error }, 'chat command failed');
      sendChatReply(res, 'Une erreur est survenue, reessayez plus tard.', 500);
    }
  });

  return router;
}
