import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { EmployeeId, EmployeeProfile, WeeklyQuestionSet } from '../../src/domain/types.js';
import type { EmployeeRepository } from '../../src/db/repositories/employeeRepository.js';
import type { WeeklyQuestionSetRepository } from '../../src/db/repositories/weeklyQuestionSetRepository.js';
import { buildAnswerId } from '../../src/chat/interestsQuestionnaire.js';
import { createChatWebhookRouter } from '../../src/chat/webhook.js';
import { TEST_QUESTION_SET } from '../fixtures/weeklyQuestions.js';

function createInMemoryEmployeeRepository(): EmployeeRepository {
  const store = new Map<EmployeeId, EmployeeProfile>();
  return {
    findById: (id) => Promise.resolve(store.get(id)),
    listActive: () =>
      Promise.resolve([...store.values()].filter((profile) => profile.status === 'active')),
    listAll: () => Promise.resolve([...store.values()]),
    upsert: (profile) => {
      store.set(profile.id, profile);
      return Promise.resolve();
    },
    setStatus: (id, status) => {
      const existing = store.get(id);
      if (existing) store.set(id, { ...existing, status, updatedAt: new Date() });
      return Promise.resolve();
    },
  };
}

function createInMemoryWeeklyQuestionSetRepository(
  initial: WeeklyQuestionSet | undefined = TEST_QUESTION_SET,
): WeeklyQuestionSetRepository {
  let current = initial;
  return {
    get: () => Promise.resolve(current),
    set: (questionSet) => {
      current = questionSet;
      return Promise.resolve();
    },
  };
}

// Par defaut, toujours choisir le premier candidat (comportement deterministe et
// coherent avec l'ordre de TEST_QUESTIONS) - un test dedie verifie la randomisation.
function createApp(
  employeeRepository: EmployeeRepository,
  random: () => number = () => 0,
  weeklyQuestionSetRepository: WeeklyQuestionSetRepository = createInMemoryWeeklyQuestionSetRepository(),
) {
  const app = express();
  app.use(express.json());
  app.use(
    createChatWebhookRouter({
      employeeRepository,
      weeklyQuestionSetRepository,
      chatWebhookUrl: 'https://example.com/chat/webhook',
      verifyBearerToken: () => Promise.resolve(true),
      random,
    }),
  );
  return app;
}

interface WebhookResult {
  status: number;
  text: string;
}

/**
 * Le webhook repond via la DataActions attendue par le framework Google Workspace
 * Add-ons (hostAppDataAction.chatDataAction.createMessageAction), pas un simple
 * `{ text }` - voir le commentaire sur sendChatReply dans src/chat/webhook.ts.
 */
function extractResult(res: unknown): WebhookResult {
  const typed = res as {
    status: number;
    body: {
      hostAppDataAction?: {
        chatDataAction?: { createMessageAction?: { message?: { text?: string } } };
      };
    };
  };
  return {
    status: typed.status,
    text: typed.body.hostAppDataAction?.chatDataAction?.createMessageAction?.message?.text ?? '',
  };
}

async function sendMessage(
  app: express.Express,
  text: string,
  email = 'alice@example.com',
): Promise<WebhookResult> {
  const res = await request(app)
    .post('/chat/webhook')
    .send({
      chat: { appCommandPayload: { message: { text, sender: { email, displayName: 'Alice' } } } },
    });
  return extractResult(res);
}

/** /rejoindre + reponse aux disponibilites, pour arriver a un profil actif standard. */
async function joinAndSetAvailability(
  app: express.Express,
  email = 'alice@example.com',
): Promise<void> {
  await sendMessage(app, '/rejoindre', email);
  await sendMessage(app, 'lundi,mardi', email);
}

describe('chat webhook', () => {
  it('refuse les requetes non authentifiees par Google Chat', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createChatWebhookRouter({
        employeeRepository: createInMemoryEmployeeRepository(),
        weeklyQuestionSetRepository: createInMemoryWeeklyQuestionSetRepository(),
        chatWebhookUrl: 'https://example.com/chat/webhook',
        verifyBearerToken: () => Promise.resolve(false),
      }),
    );

    const res = await request(app)
      .post('/chat/webhook')
      .send({ chat: { appCommandPayload: { message: { text: '/aide' } } } });
    expect(res.status).toBe(401);
  });

  it('/rejoindre demande les disponibilites de la semaine avant toute question', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    const res = await sendMessage(app, '/rejoindre');
    expect(res.text).toMatch(/Bienvenue/);
    expect(res.text).toMatch(/disponible/i);

    const profile = await repo.findById('alice@example.com');
    expect(profile?.status).toBe('active');
    expect(profile?.awaitingAvailability).toBe(true);
  });

  it('/rejoindre refuse de participer quand AlloLunch est en pause cette semaine', async () => {
    const repo = createInMemoryEmployeeRepository();
    const pausedQuestionSet: WeeklyQuestionSet = { ...TEST_QUESTION_SET, status: 'paused' };
    const app = createApp(
      repo,
      () => 0,
      createInMemoryWeeklyQuestionSetRepository(pausedQuestionSet),
    );

    const res = await sendMessage(app, '/rejoindre');
    expect(res.text).toMatch(/pause/i);

    const profile = await repo.findById('alice@example.com');
    expect(profile).toBeUndefined();
  });

  it('repondre aux disponibilites enchaine immediatement sur la premiere question', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await sendMessage(app, '/rejoindre');
    const res = await sendMessage(app, 'lundi,mardi');

    expect(res.text).toMatch(/Disponibilites enregistrees: lundi, mardi/);
    expect(res.text).toMatch(/cuisine/i);

    const profile = await repo.findById('alice@example.com');
    expect(profile?.availableDays).toEqual(['lundi', 'mardi']);
    expect(profile?.awaitingAvailability).toBe(false);
    expect(profile?.interestsQuestionnaireActive).toBe(true);
  });

  it('/pause sans profil existant renvoie un message explicite', async () => {
    const app = createApp(createInMemoryEmployeeRepository());
    const res = await sendMessage(app, '/pause');
    expect(res.text).toMatch(/pas encore de profil/);
  });

  it('/pause met a jour un profil existant', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    await sendMessage(app, '/pause');

    const profile = await repo.findById('alice@example.com');
    expect(profile?.status).toBe('paused');
  });

  it('/interets lance le questionnaire sur la premiere question non repondue', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    const res = await sendMessage(app, '/interets');

    expect(res.text).toMatch(/cuisine/i);
    expect(res.text).toMatch(/1\. Italienne/);
    const profile = await repo.findById('alice@example.com');
    expect(profile?.interestsQuestionnaireActive).toBe(true);
  });

  it("l'ordre des questions depend du random injecte (pas toujours cuisine en premier)", async () => {
    const repo = createInMemoryEmployeeRepository();
    // random proche de 1: pointe vers le dernier candidat (entrepreneuriat, 12e categorie).
    const app = createApp(repo, () => 0.999);

    await joinAndSetAvailability(app);
    const res = await sendMessage(app, '/interets');

    expect(res.text).toMatch(/entrepreneuriat/i);
  });

  it('une reponse valide (numero) enregistre la reponse et enchaine sur la question suivante', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    await sendMessage(app, '/interets');
    const res = await sendMessage(app, '1');

    expect(res.text).toMatch(/Enregistre : Italienne/);
    expect(res.text).toMatch(/sport/i);
    const profile = await repo.findById('alice@example.com');
    expect(profile?.interestAnswers).toEqual([buildAnswerId('cuisine', '1')]);
    expect(profile?.interestsQuestionnaireActive).toBe(true);
  });

  it('une reponse invalide redemande la meme question sans modifier le profil', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    await sendMessage(app, '/interets');
    const res = await sendMessage(app, '99');

    expect(res.text).toMatch(/Reponse invalide/);
    expect(res.text).toMatch(/cuisine/i);
    const profile = await repo.findById('alice@example.com');
    expect(profile?.interestAnswers).toEqual([]);
  });

  it('repondre 0 passe la question suivante sans enregistrer de reponse', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    await sendMessage(app, '/interets');
    const res = await sendMessage(app, '0');

    expect(res.text).toMatch(/Question passee/);
    expect(res.text).toMatch(/sport/i);
    const profile = await repo.findById('alice@example.com');
    expect(profile?.interestAnswers).toEqual([]);
    expect(profile?.interestsSkippedCategories).toEqual(['cuisine']);
  });

  it('/interets propose la categorie suivante apres avoir passe une question (pas de redemarrage)', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    await sendMessage(app, '/interets');
    await sendMessage(app, '1'); // repond cuisine, avance sur sport
    await sendMessage(app, '0'); // passe sport

    const res = await sendMessage(app, '/interets');
    expect(res.text).toMatch(/voyage/i);
  });

  it('une question passee revient a la fin une fois toutes les autres traitees', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    await sendMessage(app, '/interets');
    await sendMessage(app, '0'); // passe cuisine

    let last = { status: 200, text: '' };
    for (let i = 0; i < 11; i++) {
      last = await sendMessage(app, '1'); // repond aux 11 autres categories
    }

    // la 11e reponse doit redemander cuisine (seule categorie restante, passee)
    expect(last.text).toMatch(/cuisine/i);

    const res = await sendMessage(app, '1'); // repond enfin cuisine -> Italienne
    expect(res.text).toMatch(/complet/);
    const profile = await repo.findById('alice@example.com');
    expect(profile?.interestAnswers).toContain(buildAnswerId('cuisine', '1'));
  });

  it('un numero envoye sans questionnaire actif tombe sur la commande inconnue', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    // Termine le questionnaire pour que plus rien n'attende de reponse.
    for (let i = 0; i < 12; i++) {
      await sendMessage(app, '1');
    }

    const res = await sendMessage(app, '2');
    expect(res.text).toMatch(/Commande inconnue/);
  });

  it('repondre a toutes les questions termine le questionnaire', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    await sendMessage(app, '/interets');

    let last = { status: 200, text: '' };
    for (let i = 0; i < 12; i++) {
      last = await sendMessage(app, '1');
    }

    expect(last.text).toMatch(/complet/);
    const profile = await repo.findById('alice@example.com');
    expect(profile?.interestsQuestionnaireActive).toBe(false);
    expect(profile?.interestAnswers).toHaveLength(12); // une reponse par categorie

    const res = await sendMessage(app, '/interets');
    expect(res.text).toMatch(/deja complet/);
  });

  it('/disponibilites valide et enregistre les jours connus', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    const res = await sendMessage(app, '/disponibilites lundi,jeudi');

    expect(res.text).toMatch(/lundi, jeudi/);
    const profile = await repo.findById('alice@example.com');
    expect(profile?.availableDays).toEqual(['lundi', 'jeudi']);
  });

  it('/profil affiche le libelle de la reponse choisie', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    await sendMessage(app, '/interets');
    await sendMessage(app, '1'); // cuisine -> Italienne
    const res = await sendMessage(app, '/profil');

    expect(res.text).toMatch(/Italienne/);
    expect(res.text).toMatch(/actif/);
  });

  it('/interets modifier ne liste que les categories deja repondues', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    await sendMessage(app, '/interets');
    await sendMessage(app, '1'); // cuisine -> Italienne
    const res = await sendMessage(app, '/interets modifier');

    expect(res.text).toMatch(/1\. Cuisine: Italienne/);
    expect(res.text).not.toMatch(/Sport/);
  });

  it("/interets modifier indique qu'il n'y a rien a modifier avant la premiere reponse", async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    const res = await sendMessage(app, '/interets modifier');

    expect(res.text).toMatch(/pas encore repondu/);
  });

  it('/interets modifier <numero> permet de changer une reponse existante', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    await sendMessage(app, '/interets');
    await sendMessage(app, '1'); // cuisine -> Italienne

    const editRes = await sendMessage(app, '/interets modifier 1');
    expect(editRes.text).toMatch(/Modifier: Cuisine/);
    expect(editRes.text).toMatch(/Reponse actuelle: Italienne/);

    const res = await sendMessage(app, '2'); // -> Asiatique
    expect(res.text).toMatch(/Mis a jour: Cuisine: Asiatique/);

    const profile = await repo.findById('alice@example.com');
    expect(profile?.interestAnswers).toEqual([buildAnswerId('cuisine', '2')]);
    expect(profile?.interestsEditingCategory).toBeUndefined();
  });

  it('0 pendant une modification annule sans changer la reponse existante', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    await sendMessage(app, '/interets');
    await sendMessage(app, '1'); // cuisine -> Italienne
    await sendMessage(app, '/interets modifier 1');

    const res = await sendMessage(app, '0');
    expect(res.text).toMatch(/annulee/);

    const profile = await repo.findById('alice@example.com');
    expect(profile?.interestAnswers).toEqual([buildAnswerId('cuisine', '1')]);
  });

  it('/interets supprimer <numero> efface la reponse sans passer par une conversation', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    await sendMessage(app, '/interets');
    await sendMessage(app, '1'); // cuisine -> Italienne
    await sendMessage(app, '1'); // sport -> Hockey

    const res = await sendMessage(app, '/interets supprimer 1');
    expect(res.text).toMatch(/Reponse supprimee pour Cuisine/);

    const profile = await repo.findById('alice@example.com');
    expect(profile?.interestAnswers).toEqual([buildAnswerId('sport', '1')]);
  });

  it('/interets modifier <numero invalide> renvoie une erreur explicite', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await joinAndSetAvailability(app);
    const res = await sendMessage(app, '/interets modifier 99');
    expect(res.text).toMatch(/Numero invalide/);
  });

  it('commande inconnue renvoie la liste des commandes', async () => {
    const app = createApp(createInMemoryEmployeeRepository());
    const res = await sendMessage(app, '/blabla');
    expect(res.text).toMatch(/Commande inconnue/);
    expect(res.text).toMatch(/\/aide/);
  });
});
