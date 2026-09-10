import 'dotenv/config';
import express from 'express';
import { loadEnv } from './config/env.js';
import { logger } from './logger.js';
import { getFirestore } from './db/firestore.js';
import { createFirestoreEmployeeRepository } from './db/repositories/employeeRepository.js';
import { createFirestoreMatchHistoryRepository } from './db/repositories/matchHistoryRepository.js';
import { createChatWebhookRouter } from './chat/webhook.js';
import { createTriggerCycleRouter } from './scheduler/triggerCycle.js';

const env = loadEnv();
const db = getFirestore(env.FIRESTORE_PROJECT_ID);
const employeeRepository = createFirestoreEmployeeRepository(db);

const app = express();
app.use(express.json());

app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

app.use(
  createChatWebhookRouter({
    employeeRepository,
    googleChatProjectNumber: env.GOOGLE_CHAT_PROJECT_NUMBER,
  }),
);
app.use(
  createTriggerCycleRouter({
    employeeRepository,
    matchHistoryRepository: createFirestoreMatchHistoryRepository(db),
    matchHistoryWindowCycles: env.MATCH_HISTORY_WINDOW_CYCLES,
  }),
);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'AlloLunch server started');
});
