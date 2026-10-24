import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import type { FastifyInstance } from 'fastify';
import type { BroadcastMessage } from '@text-them/shared';
import { connectDatabase, type Database } from '../db/index.js';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import {
  INTERRUPTED_AFTER_MS,
  MISSED_AFTER_MS,
  runDueBroadcasts,
  type BroadcastDeps,
} from '../services/broadcasts.js';
import type { SendOptions, TwilioService } from '../services/twilio.js';

const STATUS_URL = 'https://api.textthem.test/api/twilio/status';
const MINUTE = 60 * 1000;

let mongod: MongoMemoryServer;
let database: Database;
let app: FastifyInstance;
let sendCalls: { recipients: string[]; body: string; options?: SendOptions }[];

const fakeTwilio: TwilioService = {
  validateSignature: () => true,
  async sendSms() {
    throw new Error('not used');
  },
  async sendBulk(recipients, body, options) {
    sendCalls.push({ recipients, body, options });
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

let deps: BroadcastDeps;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  database = await connectDatabase(mongod.getUri(), 'test');
  deps = { collections: database.collections, twilio: fakeTwilio, statusCallbackUrl: STATUS_URL };
  app = await buildApp({
    config: loadConfig({
      MONGODB_URI: 'mongodb://unused',
      TWILIO_ACCOUNT_SID: 'AC_test',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_MESSAGING_SERVICE_SID: 'MG_test',
      CLERK_SECRET_KEY: 'sk_test',
      CLERK_PUBLISHABLE_KEY: 'pk_test',
      PUBLIC_BASE_URL: 'https://api.textthem.test',
    } as NodeJS.ProcessEnv),
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

async function seedGroup(phones: string[]): Promise<ObjectId> {
  const now = new Date();
  const groupId = new ObjectId();
  await database.collections.groups.insertOne({
    _id: groupId,
    name: 'Dragons',
    keyword: 'DRAGON',
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  for (const phone of phones) await subscribe(groupId, phone);
  return groupId;
}

async function subscribe(groupId: ObjectId, phoneNumber: string): Promise<void> {
  const memberId = new ObjectId();
  await database.collections.members.insertOne({ _id: memberId, phoneNumber, createdAt: new Date() });
  await database.collections.subscriptions.insertOne({
    _id: new ObjectId(),
    memberId,
    groupId,
    status: 'subscribed',
    source: 'sms',
    subscribedAt: new Date(),
  });
}

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * MINUTE);

function postBroadcast(groupId: ObjectId, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: `/api/groups/${groupId.toHexString()}/broadcast`,
    payload,
  });
}

async function schedule(groupId: ObjectId, sendAt: Date, body = 'Hello later'): Promise<BroadcastMessage> {
  const res = await postBroadcast(groupId, { body, sendAt: sendAt.toISOString() });
  expect(res.statusCode).toBe(201);
  return res.json().message;
}

async function listMessages(): Promise<BroadcastMessage[]> {
  return (await app.inject({ method: 'GET', url: '/api/messages' })).json().messages;
}

async function statusOf(id: string) {
  return (await database.collections.messages.findOne({ _id: new ObjectId(id) }))?.status;
}

describe('scheduled broadcasts', () => {
  it('sends right away when no time is given', async () => {
    const groupId = await seedGroup(['+15550000001']);
    const res = await postBroadcast(groupId, { body: 'Now!' });

    expect(res.statusCode).toBe(201);
    expect(res.json().message).toMatchObject({ status: 'sent', recipientCount: 1, acceptedCount: 1 });
    expect(res.json().message.sentAt).toBeDefined();
    expect(sendCalls).toHaveLength(1);
  });

  it('schedules without sending anything', async () => {
    const groupId = await seedGroup(['+15550000001']);
    const sendAt = inMinutes(60);
    const message = await schedule(groupId, sendAt);

    expect(message).toMatchObject({
      status: 'scheduled',
      scheduledFor: sendAt.toISOString(),
      recipientCount: 0,
    });
    expect(message.sentAt).toBeUndefined();
    expect(sendCalls).toHaveLength(0);
  });

  it.each([
    ['in the past', new Date(Date.now() - MINUTE).toISOString()],
    ['less than a minute away', new Date(Date.now() + 30 * 1000).toISOString()],
    ['not a date', 'next tuesday'],
  ])('rejects a send time %s', async (_label, sendAt) => {
    const groupId = await seedGroup([]);
    const res = await postBroadcast(groupId, { body: 'Hello', sendAt });
    expect(res.statusCode).toBe(400);
  });

  it('leaves a broadcast alone until it is due', async () => {
    const groupId = await seedGroup(['+15550000001']);
    const sendAt = inMinutes(60);
    const message = await schedule(groupId, sendAt);

    const result = await runDueBroadcasts(deps, new Date(sendAt.getTime() - MINUTE));
    expect(result.sent).toBe(0);
    expect(await statusOf(message.id)).toBe('scheduled');
  });

  it('sends when due, to whoever is subscribed at that time', async () => {
    const groupId = await seedGroup(['+15550000001']);
    const sendAt = inMinutes(60);
    const message = await schedule(groupId, sendAt, 'See you Saturday');
    await subscribe(groupId, '+15550000002'); // joined after it was scheduled

    const result = await runDueBroadcasts(deps, new Date(sendAt.getTime() + MINUTE));

    expect(result.sent).toBe(1);
    expect(sendCalls).toEqual([
      {
        recipients: ['+15550000001', '+15550000002'],
        body: 'See you Saturday',
        options: { statusCallback: STATUS_URL },
      },
    ]);
    const [listed] = await listMessages();
    expect(listed).toMatchObject({
      id: message.id,
      status: 'sent',
      recipientCount: 2,
      acceptedCount: 2,
      delivery: { delivered: 0, undelivered: 0, pending: 2 },
    });
    expect(await database.collections.deliveries.countDocuments({})).toBe(2);
  });

  it('sends a due broadcast only once when passes overlap', async () => {
    const groupId = await seedGroup(['+15550000001']);
    const sendAt = inMinutes(5);
    await schedule(groupId, sendAt);
    const now = new Date(sendAt.getTime() + MINUTE);

    const results = await Promise.all([
      runDueBroadcasts(deps, now),
      runDueBroadcasts(deps, now),
      runDueBroadcasts(deps, now),
    ]);

    expect(results.reduce((n, r) => n + r.sent, 0)).toBe(1);
    expect(sendCalls).toHaveLength(1);
  });

  it('marks a broadcast missed, not sent, once it is over an hour late', async () => {
    const groupId = await seedGroup(['+15550000001']);
    const sendAt = inMinutes(5);
    const message = await schedule(groupId, sendAt);

    const result = await runDueBroadcasts(deps, new Date(sendAt.getTime() + MISSED_AFTER_MS + MINUTE));

    expect(result).toMatchObject({ sent: 0, missed: 1 });
    expect(sendCalls).toHaveLength(0);
    expect(await statusOf(message.id)).toBe('missed');
  });

  it('still sends a broadcast that is late but within the hour', async () => {
    const groupId = await seedGroup(['+15550000001']);
    const sendAt = inMinutes(5);
    await schedule(groupId, sendAt);

    const result = await runDueBroadcasts(deps, new Date(sendAt.getTime() + MISSED_AFTER_MS - MINUTE));
    expect(result).toMatchObject({ sent: 1, missed: 0 });
  });

  it('flags a send that was cut off instead of retrying it', async () => {
    const _id = new ObjectId();
    await database.collections.messages.insertOne({
      _id,
      groupId: new ObjectId(),
      body: 'Half sent',
      sentByUserId: 'user_123',
      status: 'sending',
      sendingStartedAt: new Date(Date.now() - INTERRUPTED_AFTER_MS - MINUTE),
      recipientCount: 0,
      acceptedCount: 0,
      failedCount: 0,
    });

    const result = await runDueBroadcasts(deps);

    expect(result).toMatchObject({ sent: 0, interrupted: 1 });
    expect(await statusOf(_id.toHexString())).toBe('interrupted');
    expect(sendCalls).toHaveLength(0);
  });

  it('edits the text and time of a scheduled broadcast', async () => {
    const groupId = await seedGroup([]);
    const message = await schedule(groupId, inMinutes(60));
    const newTime = inMinutes(120);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/messages/${message.id}`,
      payload: { body: 'Updated text', sendAt: newTime.toISOString() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toMatchObject({
      status: 'scheduled',
      body: 'Updated text',
      scheduledFor: newTime.toISOString(),
    });
  });

  it('cancels a scheduled broadcast so it never sends', async () => {
    const groupId = await seedGroup(['+15550000001']);
    const sendAt = inMinutes(5);
    const message = await schedule(groupId, sendAt);

    const res = await app.inject({ method: 'POST', url: `/api/messages/${message.id}/cancel` });
    expect(res.statusCode).toBe(200);
    expect(res.json().message.status).toBe('canceled');

    await runDueBroadcasts(deps, new Date(sendAt.getTime() + MINUTE));
    expect(sendCalls).toHaveLength(0);
  });

  it('refuses to edit or cancel once a broadcast has been sent', async () => {
    const groupId = await seedGroup(['+15550000001']);
    const sendAt = inMinutes(5);
    const message = await schedule(groupId, sendAt);
    await runDueBroadcasts(deps, new Date(sendAt.getTime() + MINUTE));

    const edit = await app.inject({
      method: 'PATCH',
      url: `/api/messages/${message.id}`,
      payload: { body: 'Too late' },
    });
    const cancel = await app.inject({ method: 'POST', url: `/api/messages/${message.id}/cancel` });

    expect(edit.statusCode).toBe(409);
    expect(cancel.statusCode).toBe(409);
  });

  it('returns 404 for an unknown broadcast', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/messages/${new ObjectId().toHexString()}/cancel`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('cancels scheduled broadcasts when their group is deleted', async () => {
    const groupId = await seedGroup(['+15550000001']);
    const message = await schedule(groupId, inMinutes(60));

    const res = await app.inject({ method: 'DELETE', url: `/api/groups/${groupId.toHexString()}` });
    expect(res.statusCode).toBe(204);
    expect(await statusOf(message.id)).toBe('canceled');
  });

  it('lists upcoming broadcasts first, soonest first, then the rest newest first', async () => {
    const groupId = await seedGroup(['+15550000001']);
    const later = await schedule(groupId, inMinutes(120), 'Later');
    const sooner = await schedule(groupId, inMinutes(60), 'Sooner');
    const sentNow = (await postBroadcast(groupId, { body: 'Now' })).json().message;
    // Legacy broadcast from before scheduling: no status field.
    const legacyId = new ObjectId();
    await database.collections.messages.insertOne({
      _id: legacyId,
      groupId,
      body: 'Old',
      sentByUserId: 'user_123',
      recipientCount: 1,
      acceptedCount: 1,
      failedCount: 0,
      sentAt: new Date(Date.now() - 24 * 60 * MINUTE),
    });

    const listed = await listMessages();
    expect(listed.map((m) => m.id)).toEqual([
      sooner.id,
      later.id,
      sentNow.id,
      legacyId.toHexString(),
    ]);
    expect(listed[3].status).toBe('sent');
  });
});

describe('scheduler timer', () => {
  it('starts with the app, sends due broadcasts, and stops on close', async () => {
    const groupId = await seedGroup(['+15550000001']);
    const _id = new ObjectId();
    // Came due while the API was restarting.
    await database.collections.messages.insertOne({
      _id,
      groupId,
      body: 'Due during a deploy',
      sentByUserId: 'user_123',
      status: 'scheduled',
      scheduledFor: new Date(Date.now() - 2 * MINUTE),
      recipientCount: 0,
      acceptedCount: 0,
      failedCount: 0,
    });

    const scheduled = await buildApp({
      config: loadConfig({
        MONGODB_URI: 'mongodb://unused',
        TWILIO_ACCOUNT_SID: 'AC_test',
        TWILIO_AUTH_TOKEN: 'token',
        TWILIO_MESSAGING_SERVICE_SID: 'MG_test',
        CLERK_SECRET_KEY: 'sk_test',
        CLERK_PUBLISHABLE_KEY: 'pk_test',
      } as NodeJS.ProcessEnv),
      twilio: fakeTwilio,
      database,
      authenticator: () => 'user_123',
      schedulerIntervalMs: 50,
      fastifyOptions: { logger: false },
    });
    await scheduled.ready();

    for (let i = 0; i < 40 && (await statusOf(_id.toHexString())) !== 'sent'; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await scheduled.close();

    expect(await statusOf(_id.toHexString())).toBe('sent');
    expect(sendCalls).toHaveLength(1);
  });
});
