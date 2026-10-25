import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { InboundMessage } from '@text-them/shared';
import { connectDatabase, type Database } from '../db/index.js';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import type { TwilioService } from '../services/twilio.js';

let mongod: MongoMemoryServer;
let database: Database;
let app: FastifyInstance;

const fakeTwilio: TwilioService = {
  validateSignature: () => true,
  async sendSms() {
    throw new Error('not used');
  },
  async sendBulk() {
    throw new Error('not used');
  },
};

const config = loadConfig({
  MONGODB_URI: 'mongodb://unused',
  TWILIO_ACCOUNT_SID: 'AC_test',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_MESSAGING_SERVICE_SID: 'MG_test',
  CLERK_SECRET_KEY: 'sk_test',
  CLERK_PUBLISHABLE_KEY: 'pk_test',
  TWILIO_SKIP_SIGNATURE_VALIDATION: 'true',
  ORG_NAME: 'Test Org',
} as NodeJS.ProcessEnv);

function buildWithAuth(userId: string | null) {
  return buildApp({
    config,
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
  const { collections } = database;
  await Promise.all([
    collections.groups.deleteMany({}),
    collections.members.deleteMany({}),
    collections.subscriptions.deleteMany({}),
    collections.inboundMessages.deleteMany({}),
  ]);
});

function textIn(from: string, body: string) {
  return app.inject({
    method: 'POST',
    url: '/api/twilio/inbound',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ From: from, Body: body }).toString(),
  });
}

async function insertGroup(keyword: string): Promise<string> {
  const _id = new ObjectId();
  const now = new Date();
  await database.collections.groups.insertOne({
    _id,
    name: keyword,
    keyword,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  return _id.toHexString();
}

async function listInbound(): Promise<InboundMessage[]> {
  const res = await app.inject({ method: 'GET', url: '/api/inbound-messages' });
  expect(res.statusCode).toBe(200);
  return res.json().messages;
}

const A = '+15550000001';
const B = '+15550000002';

describe('inbound messages API', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const anon = await buildWithAuth(null);
    await anon.ready();
    const res = await anon.inject({ method: 'GET', url: '/api/inbound-messages' });
    expect(res.statusCode).toBe(401);
    await anon.close();
  });

  it('lists texts received, most recent first, with what each one did', async () => {
    await insertGroup('DRAGON');
    await textIn(A, 'dragon');
    await textIn(A, 'See you Saturday!');
    await textIn(B, 'HELP');

    const messages = await listInbound();
    expect(messages.map((m) => [m.fromNumber, m.body, m.action])).toEqual([
      [B, 'HELP', 'help'],
      [A, 'See you Saturday!', 'unknown'],
      [A, 'dragon', 'join'],
    ]);
    expect(messages[2].matchedKeyword).toBe('DRAGON');
  });

  it('shows the groups each sender is in now, not when they texted', async () => {
    const dragons = await insertGroup('DRAGON');
    const tigers = await insertGroup('TIGER');
    await textIn(A, 'DRAGON');
    await textIn(A, 'TIGER');
    await textIn(A, 'Thanks');
    await textIn(B, 'Who is this?');

    let messages = await listInbound();
    // Every text from A carries A's current groups, even the one sent before joining TIGER.
    for (const m of messages.filter((m) => m.fromNumber === A)) {
      expect(m.groupIds.sort()).toEqual([dragons, tigers].sort());
    }
    expect(messages.find((m) => m.fromNumber === B)?.groupIds).toEqual([]);

    await textIn(A, 'STOP');
    messages = await listInbound();
    expect(messages.filter((m) => m.fromNumber === A).every((m) => m.groupIds.length === 0)).toBe(
      true,
    );
  });
});
