import 'dotenv/config';
import express from 'express';
import { loadEnv } from './config/env.js';
import { logger } from './logger.js';
import { getFirestore } from './db/firestore.js';
import { createFirestoreEmployeeRepository } from './db/repositories/employeeRepository.js';
import { createFirestoreMatchHistoryRepository } from './db/repositories/matchHistoryRepository.js';
import { createFirestoreMatchCycleRepository } from './db/repositories/matchCycleRepository.js';
import { createFirestoreWeeklyQuestionSetRepository } from './db/repositories/weeklyQuestionSetRepository.js';
import { createChatWebhookRouter } from './chat/webhook.js';
import { createGoogleChatNotifier } from './chat/chatNotifier.js';
import { createGoogleCalendarService } from './calendar/calendarService.js';
import { createGeminiQuestionGenerator } from './ai/geminiQuestionGenerator.js';
import { createTriggerCycleRouter } from './scheduler/triggerCycle.js';
import { createInterestsReminderRouter } from './scheduler/interestsReminder.js';
import { createWeeklyResetRouter } from './scheduler/weeklyReset.js';

const env = loadEnv();
const db = getFirestore(env.FIRESTORE_PROJECT_ID);
const employeeRepository = createFirestoreEmployeeRepository(db);
const weeklyQuestionSetRepository = createFirestoreWeeklyQuestionSetRepository(db);
const chatNotifier = createGoogleChatNotifier();

const app = express();
app.use(express.json());

app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

app.use(
  createChatWebhookRouter({
    employeeRepository,
    weeklyQuestionSetRepository,
    chatWebhookUrl: env.CHAT_WEBHOOK_URL,
  }),
);
app.use(
  createTriggerCycleRouter({
    employeeRepository,
    matchHistoryRepository: createFirestoreMatchHistoryRepository(db),
    matchCycleRepository: createFirestoreMatchCycleRepository(db),
    weeklyQuestionSetRepository,
    matchHistoryWindowCycles: env.MATCH_HISTORY_WINDOW_CYCLES,
    calendarService: createGoogleCalendarService(env.CALENDAR_DELEGATED_SERVICE_ACCOUNT_EMAIL),
    chatNotifier,
  }),
);
app.use(
  createInterestsReminderRouter({ employeeRepository, weeklyQuestionSetRepository, chatNotifier }),
);
app.use(
  createWeeklyResetRouter({
    employeeRepository,
    weeklyQuestionSetRepository,
    geminiQuestionGenerator: createGeminiQuestionGenerator(env.GEMINI_API_KEY),
    chatNotifier,
  }),
);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'AlloLunch server started');
});
