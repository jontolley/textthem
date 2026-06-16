import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { FastifyInstance } from 'fastify';
import { connectDatabase, type Database } from '../db/index.js';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import type { TwilioService } from '../services/twilio.js';

let mongod: MongoMemoryServer;
let database: Database;
let app: FastifyInstance;
let sent: { to: string; body: string }[];

const fakeTwilio: TwilioService = {
  validateSignature: () => true,
  async sendSms(to, body) {
    sent.push({ to, body });
    return true;
  },
  async sendBulk(recipients, body) {
    recipients.forEach((to) => sent.push({ to, body }));
    return { accepted: recipients.length, failed: 0 };
  },
};

const baseEnv = {
  MONGODB_URI: 'mongodb://unused',
  TWILIO_ACCOUNT_SID: 'AC_test',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_MESSAGING_SERVICE_SID: 'MG_test',
  CLERK_SECRET_KEY: 'sk_test',
  CLERK_PUBLISHABLE_KEY: 'pk_test',
  TWILIO_SKIP_SIGNATURE_VALIDATION: 'true',
  ORG_NAME: 'Test Org',
};

function buildWithAuth(userId: string | null) {
  return buildApp({
    config: loadConfig(baseEnv as NodeJS.ProcessEnv),
    twilio: fakeTwilio,
    database,
    authenticator: () => userId,
    fastifyOptions: { logger: false },
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  database = await connectDatabase(mongod.getUri(), 'test');
  app = await buildWithAuth('user_123');
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await database.client.close();
  await mongod.stop();
});

beforeEach(async () => {
  sent = [];
  const { collections } = database;
  await Promise.all([
    collections.groups.deleteMany({}),
    collections.members.deleteMany({}),
    collections.subscriptions.deleteMany({}),
    collections.messages.deleteMany({}),
  ]);
});

async function createGroup(body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/groups', payload: body });
}

describe('groups API', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const anon = await buildWithAuth(null);
    await anon.ready();
    const res = await anon.inject({ method: 'GET', url: '/api/groups' });
    expect(res.statusCode).toBe(401);
    await anon.close();
  });

  it('creates a group and uppercases the keyword', async () => {
    const res = await createGroup({ name: 'Dragons', keyword: 'dragon' });
    expect(res.statusCode).toBe(201);
    expect(res.json().group.keyword).toBe('DRAGON');
    expect(res.json().group.memberCount).toBe(0);
  });

  it('rejects an invalid keyword', async () => {
    const res = await createGroup({ name: 'Bad', keyword: 'has spaces' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a duplicate keyword with 409', async () => {
    await createGroup({ name: 'Dragons', keyword: 'DRAGON' });
    const res = await createGroup({ name: 'Other', keyword: 'dragon' });
    expect(res.statusCode).toBe(409);
  });

  it('reports member counts', async () => {
    const created = await createGroup({ name: 'Dragons', keyword: 'DRAGON' });
    const groupId = created.json().group.id;

    // Simulate two opt-ins via the Twilio webhook.
    for (const phone of ['+15550000001', '+15550000002']) {
      await app.inject({
        method: 'POST',
        url: '/api/twilio/inbound',
        payload: { From: phone, Body: 'DRAGON' },
      });
    }

    const list = await app.inject({ method: 'GET', url: '/api/groups' });
    const group = list.json().groups.find((g: { id: string }) => g.id === groupId);
    expect(group.memberCount).toBe(2);
  });

  it('broadcasts to subscribed members', async () => {
    const created = await createGroup({ name: 'Dragons', keyword: 'DRAGON' });
    const groupId = created.json().group.id;
    await app.inject({
      method: 'POST',
      url: '/api/twilio/inbound',
      payload: { From: '+15550000001', Body: 'DRAGON' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${groupId}/broadcast`,
      payload: { body: 'Hello dragons!' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().message.recipientCount).toBe(1);
    expect(res.json().message.acceptedCount).toBe(1);
    expect(sent).toEqual([{ to: '+15550000001', body: 'Hello dragons!' }]);
  });
});
