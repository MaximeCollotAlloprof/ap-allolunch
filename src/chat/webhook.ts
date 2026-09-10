import type { Request, Response } from 'express';
import { Router } from 'express';
import { logger } from '../logger.js';

export interface ChatCommandContext {
  employeeId: string;
  displayName: string;
  argument?: string;
}

export type ChatCommandHandler = (ctx: ChatCommandContext) => Promise<string>;

/**
 * Table de dispatch des commandes du bot. Chaque commande est un lot independant
 * (voir docs/tickets.md - lot 1) et retourne le texte de reponse envoye dans Google Chat.
 */
export const commandHandlers: Record<string, ChatCommandHandler> = {
  '/profil': () => {
    throw new Error('/profil: not implemented yet');
  },
  '/interets': () => {
    throw new Error('/interets: not implemented yet');
  },
  '/disponibilites': () => {
    throw new Error('/disponibilites: not implemented yet');
  },
  '/pause': () => {
    throw new Error('/pause: not implemented yet');
  },
  '/rejoindre': () => {
    throw new Error('/rejoindre: not implemented yet');
  },
};

export function createChatWebhookRouter(): Router {
  const router = Router();

  router.post('/chat/webhook', async (req: Request, res: Response) => {
    // TODO (lot 1): verifier l'en-tete Bearer du token Google Chat avant tout traitement.
    // https://developers.google.com/workspace/chat/authenticate-authorize-chat-app
    const event = req.body as {
      message?: { text?: string; sender?: { email?: string; displayName?: string } };
    };
    const text = event.message?.text?.trim() ?? '';
    const [command, ...rest] = text.split(/\s+/);

    const handler = command ? commandHandlers[command] : undefined;
    if (!handler || !event.message?.sender?.email) {
      res.json({ text: 'Commande inconnue. Tapez /aide pour la liste des commandes.' });
      return;
    }

    try {
      const argument = rest.join(' ');
      const reply = await handler({
        employeeId: event.message.sender.email,
        displayName: event.message.sender.displayName ?? event.message.sender.email,
        ...(argument ? { argument } : {}),
      });
      res.json({ text: reply });
    } catch (error) {
      logger.error({ error }, 'chat command failed');
      res.status(500).json({ text: 'Une erreur est survenue, reessayez plus tard.' });
    }
  });

  return router;
}
