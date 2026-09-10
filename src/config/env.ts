import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  FIRESTORE_PROJECT_ID: z.string().min(1),
  GOOGLE_CHAT_PROJECT_NUMBER: z.string().min(1),
  CALENDAR_DELEGATED_SERVICE_ACCOUNT_EMAIL: z.string().email(),
  MATCH_HISTORY_WINDOW_CYCLES: z.coerce.number().int().positive().default(4),
});

export type Env = z.infer<typeof envSchema>;

// Echoue au demarrage (fail fast) plutot que de crasher plus tard sur une variable manquante.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Configuration invalide:\n${parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }
  return parsed.data;
}
