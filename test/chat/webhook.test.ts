import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { EmployeeId, EmployeeProfile } from '../../src/domain/types.js';
import type { EmployeeRepository } from '../../src/db/repositories/employeeRepository.js';
import { createChatWebhookRouter } from '../../src/chat/webhook.js';

function createInMemoryEmployeeRepository(): EmployeeRepository {
  const store = new Map<EmployeeId, EmployeeProfile>();
  return {
    findById: (id) => Promise.resolve(store.get(id)),
    listActive: () =>
      Promise.resolve([...store.values()].filter((profile) => profile.status === 'active')),
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

function createApp(employeeRepository: EmployeeRepository) {
  const app = express();
  app.use(express.json());
  app.use(
    createChatWebhookRouter({
      employeeRepository,
      chatWebhookUrl: 'https://example.com/chat/webhook',
      verifyBearerToken: () => Promise.resolve(true),
    }),
  );
  return app;
}

interface WebhookResponse {
  status: number;
  body: { text: string };
}

async function sendMessage(
  app: express.Express,
  text: string,
  email = 'alice@example.com',
): Promise<WebhookResponse> {
  const res: unknown = await request(app)
    .post('/chat/webhook')
    .send({
      chat: { appCommandPayload: { message: { text, sender: { email, displayName: 'Alice' } } } },
    });
  return res as WebhookResponse;
}

describe('chat webhook', () => {
  it('refuse les requetes non authentifiees par Google Chat', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createChatWebhookRouter({
        employeeRepository: createInMemoryEmployeeRepository(),
        chatWebhookUrl: 'https://example.com/chat/webhook',
        verifyBearerToken: () => Promise.resolve(false),
      }),
    );

    const res = await request(app)
      .post('/chat/webhook')
      .send({ message: { text: '/aide' } });
    expect(res.status).toBe(401);
  });

  it('/rejoindre cree un profil actif', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    const res = await sendMessage(app, '/rejoindre');
    expect(res.body.text).toMatch(/Bienvenue/);

    const profile = await repo.findById('alice@example.com');
    expect(profile?.status).toBe('active');
  });

  it('/pause sans profil existant renvoie un message explicite', async () => {
    const app = createApp(createInMemoryEmployeeRepository());
    const res = await sendMessage(app, '/pause');
    expect(res.body.text).toMatch(/pas encore de profil/);
  });

  it('/pause met a jour un profil existant', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await sendMessage(app, '/rejoindre');
    await sendMessage(app, '/pause');

    const profile = await repo.findById('alice@example.com');
    expect(profile?.status).toBe('paused');
  });

  it('/interets valide et enregistre les tags connus', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await sendMessage(app, '/rejoindre');
    const res = await sendMessage(app, '/interets cuisine, sport');

    expect(res.body.text).toMatch(/cuisine, sport/);
    const profile = await repo.findById('alice@example.com');
    expect(profile?.interestTags).toEqual(['cuisine', 'sport']);
  });

  it('/interets rejette les tags inconnus sans modifier le profil', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await sendMessage(app, '/rejoindre');
    const res = await sendMessage(app, '/interets cuisine,escrime');

    expect(res.body.text).toMatch(/inconnu/);
    const profile = await repo.findById('alice@example.com');
    expect(profile?.interestTags).toEqual([]);
  });

  it('/disponibilites valide et enregistre les jours connus', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await sendMessage(app, '/rejoindre');
    const res = await sendMessage(app, '/disponibilites lundi,jeudi');

    expect(res.body.text).toMatch(/lundi, jeudi/);
    const profile = await repo.findById('alice@example.com');
    expect(profile?.availableDays).toEqual(['lundi', 'jeudi']);
  });

  it('/profil affiche le profil courant', async () => {
    const repo = createInMemoryEmployeeRepository();
    const app = createApp(repo);

    await sendMessage(app, '/rejoindre');
    await sendMessage(app, '/interets cuisine');
    const res = await sendMessage(app, '/profil');

    expect(res.body.text).toMatch(/cuisine/);
    expect(res.body.text).toMatch(/actif/);
  });

  it('commande inconnue renvoie la liste des commandes', async () => {
    const app = createApp(createInMemoryEmployeeRepository());
    const res = await sendMessage(app, '/blabla');
    expect(res.body.text).toMatch(/Commande inconnue/);
    expect(res.body.text).toMatch(/\/aide/);
  });
});
