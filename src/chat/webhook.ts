import type { Request, Response } from 'express';
import { Router } from 'express';
import { logger } from '../logger.js';
import type { EmployeeRepository } from '../db/repositories/employeeRepository.js';
import type { DayOfWeek, EmployeeProfile } from '../domain/types.js';
import { createGoogleChatTokenVerifier, type BearerTokenVerifier } from './auth.js';
import {
  findNextQuestion,
  formatEditPrompt,
  formatInterestsEditList,
  formatQuestionPrompt,
  getDisplayInterestLabels,
  getQuestionByCategory,
  getQuestionByIndex,
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
  '/interets modifier - liste tes reponses et permet de changer une reponse',
  '/interets supprimer <numero> - efface la reponse de cette categorie',
  `/disponibilites <jours separes par des virgules> - definit tes jours disponibles (${DAYS_OF_WEEK.join(', ')})`,
  '/profil - affiche ton profil actuel',
  '/aide - affiche ce message',
].join('\n');

export interface ChatCommandDeps {
  employeeRepository: EmployeeRepository;
  /** Injectable pour des tests deterministes - ordre aleatoire des questions /interets. */
  random?: () => number;
}

export function createCommandHandlers(deps: ChatCommandDeps): Record<string, ChatCommandHandler> {
  const { employeeRepository, random } = deps;

  return {
    '/aide': () => Promise.resolve(HELP_MESSAGE),

    '/rejoindre': async (ctx) => {
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
            interestTags: [],
            availableDays: [],
            interestsQuestionnaireActive: false,
            createdAt: now,
            updatedAt: now,
            ...(ctx.spaceName ? { chatSpaceName: ctx.spaceName } : {}),
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

      const [action, indexRaw] = (ctx.argument ?? '').trim().toLowerCase().split(/\s+/);

      if (action === 'modifier' && !indexRaw) {
        return formatInterestsEditList(profile.interestTags);
      }

      if (action === 'modifier' && indexRaw) {
        const question = getQuestionByIndex(Number.parseInt(indexRaw, 10));
        if (!question) {
          return 'Numero invalide. Tape /interets modifier pour voir la liste des categories.';
        }
        await employeeRepository.upsert({
          ...profile,
          interestsEditingCategory: question.category,
          updatedAt: new Date(),
        });
        const current = question.options.find((o) => profile.interestTags.includes(o.tag));
        return formatEditPrompt(question, current?.label);
      }

      if (action === 'supprimer' && indexRaw) {
        const question = getQuestionByIndex(Number.parseInt(indexRaw, 10));
        if (!question) {
          return 'Numero invalide. Tape /interets modifier pour voir la liste des categories.';
        }
        const categoryTags = new Set([question.category, ...question.options.map((o) => o.tag)]);
        const updatedTags = profile.interestTags.filter((tag) => !categoryTags.has(tag));
        await employeeRepository.upsert({
          ...profile,
          interestTags: updatedTags,
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
        profile.interestTags,
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
  random: (() => number) | undefined,
): Promise<string> {
  const skipped = profile.interestsSkippedCategories ?? [];
  const question = findNextQuestion(profile.interestTags, skipped, random);
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
    const nextQuestion = findNextQuestion(profile.interestTags, updatedSkipped, random);

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

  const updatedTags = [...new Set([...profile.interestTags, question.category, selected.tag])];
  const nextQuestion = findNextQuestion(updatedTags, skipped, random);

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

/**
 * Traite un message texte brut comme une reponse a une modification ciblee en cours
 * (/interets modifier <numero>) - appele en priorite sur handleInterestsAnswer quand
 * `profile.interestsEditingCategory` est defini (voir createChatWebhookRouter).
 */
async function handleCategoryEditAnswer(
  employeeRepository: EmployeeRepository,
  profile: EmployeeProfile,
  rawAnswer: string,
): Promise<string> {
  const question = profile.interestsEditingCategory
    ? getQuestionByCategory(profile.interestsEditingCategory)
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
    const current = question.options.find((o) => profile.interestTags.includes(o.tag));
    return `Reponse invalide.\n\n${formatEditPrompt(question, current?.label)}`;
  }

  const categoryTags = new Set([question.category, ...question.options.map((o) => o.tag)]);
  const updatedTags = [
    ...profile.interestTags.filter((tag) => !categoryTags.has(tag)),
    question.category,
    selected.tag,
  ];

  await employeeRepository.upsert({
    ...withoutEditingCategory(profile),
    interestTags: updatedTags,
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
  const { employeeRepository, random } = deps;
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
      // Un message texte brut (pas une commande) est interprete comme une reponse au
      // questionnaire /interets en cours - en priorite une modification ciblee
      // (/interets modifier <numero>), sinon la progression sequentielle normale.
      if (senderEmail && !text.startsWith('/')) {
        const profile = await employeeRepository.findById(senderEmail);
        if (profile?.interestsEditingCategory) {
          const reply = await handleCategoryEditAnswer(employeeRepository, profile, text);
          sendChatReply(res, reply);
          return;
        }
        if (profile?.interestsQuestionnaireActive) {
          const reply = await handleInterestsAnswer(employeeRepository, profile, text, random);
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
