import { google } from 'googleapis';

export interface ChatNotifier {
  /** Envoie un message proactif (pas en reponse synchrone a une requete entrante). */
  sendDirectMessage(spaceName: string, text: string): Promise<void>;
}

/**
 * Cf. https://developers.google.com/workspace/chat/authenticate-authorize-chat-app - pour
 * envoyer un message de son propre chef (ex: notification de match, pas une reponse a un
 * evenement recu), l'app s'authentifie avec les credentials par defaut de son
 * environnement d'execution (Cloud Run) et le scope `chat.bot`. Contrairement a Calendar,
 * aucune delegation domain-wide n'est necessaire ici.
 */
export function createGoogleChatNotifier(): ChatNotifier {
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/chat.bot'] });
  const chatApi = google.chat({ version: 'v1', auth });

  return {
    async sendDirectMessage(spaceName, text) {
      await chatApi.spaces.messages.create({
        parent: spaceName,
        requestBody: { text },
      });
    },
  };
}
