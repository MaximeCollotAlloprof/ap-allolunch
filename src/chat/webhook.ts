import type { Request, Response } from 'express';
import { Router } from 'express';
import { logger } from '../logger.js';
import type { EmployeeRepository } from '../db/repositories/employeeRepository.js';
import type { DayOfWeek, EmployeeProfile, InterestTag } from '../domain/types.js';
import { createGoogleChatTokenVerifier, type BearerTokenVerifier } from './auth.js';

export interface ChatCommandContext {
  employeeId: string;
  displayName: string;
  argument?: string;
}

export type ChatCommandHandler = (ctx: ChatCommandContext) => Promise<string>;

export const INTEREST_TAGS: readonly InterestTag[] = [
  'cuisine',
  'sport',
  'voyage',
  'technologie',
  'jeux-video',
  'lecture',
  'musique',
  'cinema',
  'plein-air',
  'art-creatif',
  'famille-enfants',
  'entrepreneuriat',
];

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
  const interests = profile.interestTags.length > 0 ? profile.interestTags.join(', ') : 'aucun';
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
  `/interets <tags separes par des virgules> - definit tes centres d'interet (${INTEREST_TAGS.join(', ')})`,
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

      if (!ctx.argument) {
        return `Indique tes centres d'interet separes par des virgules parmi: ${INTEREST_TAGS.join(', ')}.\nEx: /interets cuisine,sport`;
      }

      const { values, invalid } = parseTaggedList(ctx.argument, INTEREST_TAGS);
      if (invalid.length > 0) {
        return `Centre(s) d'interet inconnu(s): ${invalid.join(', ')}.\nChoix valides: ${INTEREST_TAGS.join(', ')}`;
      }

      await employeeRepository.upsert({ ...profile, interestTags: values, updatedAt: new Date() });
      return `Centres d'interet mis a jour: ${values.join(', ') || 'aucun'}.`;
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

export interface ChatWebhookDeps extends ChatCommandDeps {
  chatWebhookUrl: string;
  /** Injectable pour les tests - par defaut verifie le token via Google (google-auth-library). */
  verifyBearerToken?: BearerTokenVerifier;
}

export function createChatWebhookRouter(deps: ChatWebhookDeps): Router {
  const router = Router();
  const commandHandlers = createCommandHandlers(deps);
  const verifyBearerToken =
    deps.verifyBearerToken ?? createGoogleChatTokenVerifier(deps.chatWebhookUrl);

  router.post('/chat/webhook', async (req: Request, res: Response) => {
    const isVerified = await verifyBearerToken(req.headers.authorization);
    if (!isVerified) {
      res.status(401).json({ text: 'Requete non autorisee.' });
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
    const [command, ...rest] = text.split(/\s+/);

    const handler = command ? commandHandlers[command] : undefined;
    if (!handler || !message?.sender?.email) {
      res.json({
        text: `Commande inconnue. Tapez /aide pour la liste des commandes.\n\n${HELP_MESSAGE}`,
      });
      return;
    }

    try {
      const argument = rest.join(' ');
      const reply = await handler({
        employeeId: message.sender.email,
        displayName: message.sender.displayName ?? message.sender.email,
        ...(argument ? { argument } : {}),
      });
      res.json({ text: reply });
    } catch (error) {
      logger.error({ err: error }, 'chat command failed');
      res.status(500).json({ text: 'Une erreur est survenue, reessayez plus tard.' });
    }
  });

  return router;
}
