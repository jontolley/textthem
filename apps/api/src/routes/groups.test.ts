import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
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
    return { to, sid: `SM${new ObjectId().toHexString()}`, status: 'accepted' };
  },
  async sendBulk(recipients, body) {
    recipients.forEach((to) => sent.push({ to, body }));
    return {
      accepted: recipients.map((to) => ({
        to,
        sid: `SM${new ObjectId().toHexString()}`,
        status: 'accepted',
      })),
      failed: 0,
    };
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
    collections.deliveries.deleteMany({}),
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

  it('answers STOP with an empty TwiML response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/twilio/inbound',
      payload: { From: '+15550000001', Body: 'STOP' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/xml');
    expect(res.body).toContain('<Response');
    expect(res.body).not.toContain('<Message');
  });

  it('stays silent on HELP that Twilio already answered (Advanced Opt-Out)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/twilio/inbound',
      payload: { From: '+15550000001', Body: 'HELP', OptOutType: 'HELP' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('<Message');
  });

  it('answers HELP itself when Twilio has not', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/twilio/inbound',
      payload: { From: '+15550000001', Body: 'HELP' },
    });
    expect(res.body).toContain('<Message>Test Org: Reply with a group keyword to join.');
  });

  it('still replies to a keyword join', async () => {
    await createGroup({ name: 'Dragons', keyword: 'DRAGON' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/twilio/inbound',
      payload: { From: '+15550000001', Body: 'DRAGON' },
    });
    expect(res.body).toContain("<Message>Test Org: You've joined Dragons.");
  });

  it('lists who left the group apart from current members, most recent first', async () => {
    const created = await createGroup({ name: 'Dragons', keyword: 'DRAGON' });
    const groupId = created.json().group.id;
    const text = (From: string, Body: string) =>
      app.inject({ method: 'POST', url: '/api/twilio/inbound', payload: { From, Body } });
    const listMembers = async () =>
      (await app.inject({ method: 'GET', url: `/api/groups/${groupId}/members` })).json();

    for (const from of ['+15550000001', '+15550000002', '+15550000003']) {
      await text(from, 'DRAGON');
    }
    await text('+15550000001', 'STOP');
    await new Promise((resolve) => setTimeout(resolve, 5)); // so the two STOPs get distinct times
    await text('+15550000003', 'STOP');

    let res = await listMembers();
    expect(res.members.map((m: { phoneNumber: string }) => m.phoneNumber)).toEqual([
      '+15550000002',
    ]);
    expect(res.unsubscribed).toMatchObject([
      { phoneNumber: '+15550000003', status: 'unsubscribed' },
      { phoneNumber: '+15550000001', status: 'unsubscribed' },
    ]);
    expect(res.unsubscribed[0].unsubscribedAt).toEqual(expect.any(String));
    expect(res.members[0].unsubscribedAt).toBeUndefined();

    // Texting the keyword again moves them back.
    await text('+15550000001', 'DRAGON');
    res = await listMembers();
    expect(res.members.map((m: { phoneNumber: string }) => m.phoneNumber).sort()).toEqual([
      '+15550000001',
      '+15550000002',
    ]);
    expect(res.unsubscribed.map((m: { phoneNumber: string }) => m.phoneNumber)).toEqual([
      '+15550000003',
    ]);
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
