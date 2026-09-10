import { OAuth2Client } from 'google-auth-library';
import { logger } from '../logger.js';

const GOOGLE_CHAT_ISSUER = 'chat@system.gserviceaccount.com';

export type BearerTokenVerifier = (authHeader: string | undefined) => Promise<boolean>;

/**
 * Cf. https://developers.google.com/workspace/chat/authenticate-authorize-chat-app
 * Google Chat signe chaque requete avec un ID token dont l'emetteur (`iss`) est
 * `chat@system.gserviceaccount.com` et l'audience le numero du projet GCP de l'app Chat.
 */
export function createGoogleChatTokenVerifier(projectNumber: string): BearerTokenVerifier {
  const client = new OAuth2Client();

  return async (authHeader) => {
    if (!authHeader?.startsWith('Bearer ')) return false;
    const idToken = authHeader.slice('Bearer '.length).trim();
    if (!idToken) return false;

    try {
      const ticket = await client.verifyIdToken({ idToken, audience: projectNumber });
      const payload = ticket.getPayload();
      return payload?.iss === GOOGLE_CHAT_ISSUER;
    } catch (error) {
      logger.warn({ error }, 'invalid google chat bearer token');
      return false;
    }
  };
}
