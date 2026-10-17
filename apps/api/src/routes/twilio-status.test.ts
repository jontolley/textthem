import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import twilio from 'twilio';
import type { FastifyInstance } from 'fastify';
import type { BroadcastMessage } from '@text-them/shared';
import { connectDatabase, type Database } from '../db/index.js';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createTwilioService, type SendOptions, type TwilioService } from '../services/twilio.js';

const AUTH_TOKEN = 'test-auth-token';
const BASE_URL = 'https://api.textthem.test';
const STATUS_URL = `${BASE_URL}/api/twilio/status`;

// Signature validation stays on: these tests sign requests like Twilio does.
const config = loadConfig({
  MONGODB_URI: 'mongodb://unused',
  TWILIO_ACCOUNT_SID: 'AC_test',
  TWILIO_AUTH_TOKEN: AUTH_TOKEN,
  TWILIO_MESSAGING_SERVICE_SID: 'MG_test',
  CLERK_SECRET_KEY: 'sk_test',
  CLERK_PUBLISHABLE_KEY: 'pk_test',
  PUBLIC_BASE_URL: BASE_URL,
  ORG_NAME: 'Test Org',
} as NodeJS.ProcessEnv);

let mongod: MongoMemoryServer;
let database: Database;
let app: FastifyInstance;
let sendCalls: { recipients: string[]; options?: SendOptions }[];

const sidFor = (to: string) => `SM${to.slice(1)}`;

// Real signature check, fake sends (Twilio accepts everything).
const fakeTwilio: TwilioService = {
  validateSignature: createTwilioService(config).validateSignature,
  async sendSms() {
    throw new Error('not used');
  },
  async sendBulk(recipients, _body, options) {
    sendCalls.push({ recipients, options });
    return {
      accepted: recipients.map((to) => ({ to, sid: sidFor(to), status: 'accepted' })),
      failed: 0,
    };
  },
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  database = await connectDatabase(mongod.getUri(), 'test');
  app = await buildApp({
    config,
    twilio: fakeTwilio,
    database,
    authenticator: () => 'user_123',
    fastifyOptions: { logger: false },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await database.client.close();
  await mongod.stop();
});

beforeEach(async () => {
  sendCalls = [];
  const { collections } = database;
  await Promise.all([
    collections.groups.deleteMany({}),
    collections.members.deleteMany({}),
    collections.subscriptions.deleteMany({}),
    collections.messages.deleteMany({}),
    collections.deliveries.deleteMany({}),
  ]);
});

/** Seeds a group subscribed to by `phones` and broadcasts to it. */
async function broadcastTo(phones: string[]): Promise<BroadcastMessage> {
  const { collections } = database;
  const now = new Date();
  const groupId = new ObjectId();
  await collections.groups.insertOne({
    _id: groupId,
    name: 'Dragons',
    keyword: 'DRAGON',
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  for (const phoneNumber of phones) {
    const memberId = new ObjectId();
    await collections.members.insertOne({ _id: memberId, phoneNumber, createdAt: now });
    await collections.subscriptions.insertOne({
      _id: new ObjectId(),
      memberId,
      groupId,
      status: 'subscribed',
      source: 'sms',
      subscribedAt: now,
    });
  }

  const res = await app.inject({
    method: 'POST',
    url: `/api/groups/${groupId.toHexString()}/broadcast`,
    payload: { body: 'Hello dragons!' },
  });
  expect(res.statusCode).toBe(201);
  return res.json().message;
}

/** Posts a form-encoded status callback, signed for STATUS_URL unless overridden. */
function postStatus(
  params: Record<string, string>,
  signature: string | null = twilio.getExpectedTwilioSignature(AUTH_TOKEN, STATUS_URL, params),
) {
  return app.inject({
    method: 'POST',
    url: '/api/twilio/status',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(signature !== null ? { 'x-twilio-signature': signature } : {}),
    },
    payload: new URLSearchParams(params).toString(),
  });
}

async function listedMessage(id: string): Promise<BroadcastMessage> {
  const res = await app.inject({ method: 'GET', url: '/api/messages' });
  return res.json().messages.find((m: BroadcastMessage) => m.id === id);
}

const A = '+15550000001';
const B = '+15550000002';
const C = '+15550000003';

describe('Twilio status callback', () => {
  it('passes a statusCallback built from PUBLIC_BASE_URL and starts sends as pending', async () => {
    const message = await broadcastTo([A, B]);

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].options?.statusCallback).toBe(STATUS_URL);
    expect(message.delivery).toEqual({ delivered: 0, undelivered: 0, pending: 2 });
  });

  it('rejects a callback with an invalid signature', async () => {
    await broadcastTo([A]);
    const res = await postStatus({ MessageSid: sidFor(A), MessageStatus: 'delivered' }, 'bogus');

    expect(res.statusCode).toBe(403);
    const doc = await database.collections.deliveries.findOne({ twilioSid: sidFor(A) });
    expect(doc?.status).toBe('accepted');
  });

  it('rejects a callback with no signature', async () => {
    const res = await postStatus({ MessageSid: sidFor(A), MessageStatus: 'delivered' }, null);
    expect(res.statusCode).toBe(403);
    expect(await database.collections.deliveries.countDocuments({})).toBe(0);
  });

  it('rejects a callback whose params differ from what was signed', async () => {
    await broadcastTo([A]);
    const signed = twilio.getExpectedTwilioSignature(AUTH_TOKEN, STATUS_URL, {
      MessageSid: sidFor(A),
      MessageStatus: 'delivered',
    });
    const res = await postStatus({ MessageSid: sidFor(A), MessageStatus: 'undelivered' }, signed);

    expect(res.statusCode).toBe(403);
    const doc = await database.collections.deliveries.findOne({ twilioSid: sidFor(A) });
    expect(doc?.status).toBe('accepted');
  });

  it('records final statuses and the error code', async () => {
    const message = await broadcastTo([A, B, C]);

    expect((await postStatus({ MessageSid: sidFor(A), MessageStatus: 'delivered' })).statusCode).toBe(204);
    expect(
      (await postStatus({ MessageSid: sidFor(B), MessageStatus: 'undelivered', ErrorCode: '30034' }))
        .statusCode,
    ).toBe(204);
    expect((await postStatus({ MessageSid: sidFor(C), MessageStatus: 'sent' })).statusCode).toBe(204);

    const doc = await database.collections.deliveries.findOne({ twilioSid: sidFor(B) });
    expect(doc).toMatchObject({ status: 'undelivered', errorCode: '30034', to: B });
    expect((await listedMessage(message.id)).delivery).toEqual({
      delivered: 1,
      undelivered: 1,
      pending: 1,
      topErrorCode: '30034',
    });
  });

  it('ignores late or repeated callbacks', async () => {
    const message = await broadcastTo([A, B]);

    await postStatus({ MessageSid: sidFor(A), MessageStatus: 'delivered' });
    await postStatus({ MessageSid: sidFor(A), MessageStatus: 'sent' }); // arrived out of order
    await postStatus({ MessageSid: sidFor(B), MessageStatus: 'undelivered', ErrorCode: '30034' });
    await postStatus({ MessageSid: sidFor(B), MessageStatus: 'undelivered', ErrorCode: '30034' });

    expect(await database.collections.deliveries.countDocuments({})).toBe(2);
    expect((await listedMessage(message.id)).delivery).toEqual({
      delivered: 1,
      undelivered: 1,
      pending: 0,
      topErrorCode: '30034',
    });
  });

  it('keeps a status that arrives before the send is recorded', async () => {
    await postStatus({ MessageSid: sidFor(A), MessageStatus: 'undelivered', ErrorCode: '30034' });
    const message = await broadcastTo([A]);

    expect(message.delivery).toEqual({
      delivered: 0,
      undelivered: 1,
      pending: 0,
      topErrorCode: '30034',
    });
    const doc = await database.collections.deliveries.findOne({ twilioSid: sidFor(A) });
    expect(doc?.broadcastId?.toHexString()).toBe(message.id);
  });

  it('reports the most common error code', async () => {
    const message = await broadcastTo([A, B, C]);

    await postStatus({ MessageSid: sidFor(A), MessageStatus: 'undelivered', ErrorCode: '30007' });
    await postStatus({ MessageSid: sidFor(B), MessageStatus: 'undelivered', ErrorCode: '30034' });
    await postStatus({ MessageSid: sidFor(C), MessageStatus: 'failed', ErrorCode: '30034' });

    expect((await listedMessage(message.id)).delivery).toMatchObject({
      undelivered: 3,
      topErrorCode: '30034',
    });
  });

  it('accepts but ignores an unrecognized status', async () => {
    await broadcastTo([A]);
    const res = await postStatus({ MessageSid: sidFor(A), MessageStatus: 'teleported' });

    expect(res.statusCode).toBe(204);
    const doc = await database.collections.deliveries.findOne({ twilioSid: sidFor(A) });
    expect(doc?.status).toBe('accepted');
  });

  it('returns 400 for a signed callback without a MessageSid', async () => {
    const res = await postStatus({ MessageStatus: 'delivered' });
    expect(res.statusCode).toBe(400);
  });

  it('omits delivery stats for broadcasts sent before tracking existed', async () => {
    const legacy = (acceptedCount: number) => ({
      _id: new ObjectId(),
      groupId: new ObjectId(),
      body: 'Old news',
      sentByUserId: 'user_123',
      recipientCount: 2,
      acceptedCount,
      failedCount: 2 - acceptedCount,
      sentAt: new Date(),
    });
    const untracked = legacy(2);
    const noneAccepted = legacy(0);
    await database.collections.messages.insertMany([untracked, noneAccepted]);

    expect((await listedMessage(untracked._id.toHexString())).delivery).toBeUndefined();
    expect((await listedMessage(noneAccepted._id.toHexString())).delivery).toEqual({
      delivered: 0,
      undelivered: 0,
      pending: 0,
    });
  });
});
