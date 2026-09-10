import { OAuth2Client } from 'google-auth-library';
import { logger } from '../logger.js';

const GOOGLE_ISSUER = 'https://accounts.google.com';
const CHAT_SERVICE_ACCOUNT_EMAIL_SUFFIX = '@gcp-sa-gsuiteaddons.iam.gserviceaccount.com';

export type BearerTokenVerifier = (authHeader: string | undefined) => Promise<boolean>;

/**
 * Cf. https://developers.google.com/workspace/chat/authenticate-authorize-chat-app
 * Pour une app Chat configuree via l'API Google Chat (Workspace Add-ons), le token signe
 * par Google a pour audience (`aud`) l'URL exacte de l'endpoint webhook, pour emetteur
 * (`iss`) `https://accounts.google.com`, et un `email` de service account se terminant par
 * `@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`.
 */
export function createGoogleChatTokenVerifier(webhookUrl: string): BearerTokenVerifier {
  const client = new OAuth2Client();

  return async (authHeader) => {
    if (!authHeader?.startsWith('Bearer ')) return false;
    const idToken = authHeader.slice('Bearer '.length).trim();
    if (!idToken) return false;

    try {
      const ticket = await client.verifyIdToken({ idToken, audience: webhookUrl });
      const payload = ticket.getPayload();
      return (
        payload?.iss === GOOGLE_ISSUER &&
        !!payload.email?.endsWith(CHAT_SERVICE_ACCOUNT_EMAIL_SUFFIX)
      );
    } catch (error) {
      logger.warn({ err: error }, 'invalid google chat bearer token');
      return false;
    }
  };
}
