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
let sentTo: string[];

const fakeTwilio: TwilioService = {
  validateSignature: () => true,
  async sendSms(to) {
    return { to, sid: `SM${new ObjectId().toHexString()}`, status: 'accepted' };
  },
  async sendBulk(recipients) {
    sentTo.push(...recipients);
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

const ALICE = '+15550000001';
const BOB = '+15550000002';
const CAROL = '+15550000003';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  database = await connectDatabase(mongod.getUri(), 'test');
  app = await buildApp({
    config: loadConfig(baseEnv as NodeJS.ProcessEnv),
    twilio: fakeTwilio,
    database,
    authenticator: () => 'user_123',
    users: async (ids) => new Map(ids.map((id) => [id, `Name of ${id}`])),
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
  sentTo = [];
  const { collections } = database;
  await Promise.all([
    collections.groups.deleteMany({}),
    collections.members.deleteMany({}),
    collections.subscriptions.deleteMany({}),
    collections.messages.deleteMany({}),
    collections.deliveries.deleteMany({}),
    collections.inboundMessages.deleteMany({}),
  ]);
});

async function createGroup(keyword: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/groups',
    payload: { name: keyword, keyword },
  });
  return res.json().group.id;
}

async function text(from: string, body: string) {
  await app.inject({
    method: 'POST',
    url: '/api/twilio/inbound',
    payload: { From: from, Body: body },
  });
}

async function memberId(phone: string): Promise<string> {
  const m = await database.collections.members.findOne({ phoneNumber: phone });
  return m!._id.toHexString();
}

type Row = { phoneNumber: string; status: string; pausedAt?: string; pausedByName?: string };

async function list(groupId: string, kind: 'members' | 'left' = 'members'): Promise<Row[]> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/groups/${groupId}/members?list=${kind}&sort=phone`,
  });
  return res.json().members;
}

async function getGroup(groupId: string) {
  return (await app.inject({ method: 'GET', url: `/api/groups/${groupId}` })).json().group;
}

function post(groupId: string, action: 'pause' | 'resume', payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: `/api/groups/${groupId}/members/${action}`, payload });
}

describe('pausing members', () => {
  it('keeps a paused member listed, marked with who paused them, but out of the counts', async () => {
    const g = await createGroup('ALPHA');
    await text(ALICE, 'ALPHA');
    await text(BOB, 'ALPHA');

    const res = await post(g, 'pause', { memberIds: [await memberId(ALICE)] });
    expect(res.statusCode).toBe(200);
    expect(res.json().memberIds).toEqual([await memberId(ALICE)]);

    const rows = await list(g);
    expect(rows).toMatchObject([
      { phoneNumber: ALICE, status: 'paused', pausedByName: 'Name of user_123' },
      { phoneNumber: BOB, status: 'subscribed' },
    ]);
    expect(rows[0].pausedAt).toEqual(expect.any(String));
    expect(rows[1].pausedAt).toBeUndefined();
    expect(await list(g, 'left')).toEqual([]);
    expect(await getGroup(g)).toMatchObject({ memberCount: 1, pausedCount: 1 });
  });

  it("doesn't send messages to paused members", async () => {
    const g = await createGroup('ALPHA');
    await text(ALICE, 'ALPHA');
    await text(BOB, 'ALPHA');
    await post(g, 'pause', { memberIds: [await memberId(ALICE)] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${g}/broadcast`,
      payload: { body: 'Hello' },
    });
    expect(res.json().message.recipientCount).toBe(1);
    expect(sentTo).toEqual([BOB]);
  });

  it('resumes paused members, and only changes those whose status changes', async () => {
    const g = await createGroup('ALPHA');
    await text(ALICE, 'ALPHA');
    await text(BOB, 'ALPHA');
    await post(g, 'pause', { all: true });

    // Pausing again changes nobody.
    expect((await post(g, 'pause', { all: true })).json().memberIds).toEqual([]);

    const res = await post(g, 'resume', { memberIds: [await memberId(BOB)] });
    expect(res.json().memberIds).toEqual([await memberId(BOB)]);
    expect((await list(g)).map((r) => r.status)).toEqual(['paused', 'subscribed']);

    const sub = await database.collections.subscriptions.findOne({
      memberId: new ObjectId(await memberId(BOB)),
    });
    expect(sub!.pausedAt).toBeUndefined();
    expect(sub!.pausedByUserId).toBeUndefined();
    expect(await getGroup(g)).toMatchObject({ memberCount: 1, pausedCount: 1 });
  });

  it('pauses everyone still in the group with all: true, not people who left', async () => {
    const g = await createGroup('ALPHA');
    await text(ALICE, 'ALPHA');
    await text(BOB, 'ALPHA');
    await text(CAROL, 'ALPHA');
    await text(CAROL, 'STOP');

    const res = await post(g, 'pause', { all: true });
    expect(res.json().memberIds).toHaveLength(2);
    expect(await list(g, 'left')).toMatchObject([{ phoneNumber: CAROL, status: 'unsubscribed' }]);
  });

  it('moves a paused member who texts STOP to Left the group, and resume leaves them there', async () => {
    const g = await createGroup('ALPHA');
    await text(ALICE, 'ALPHA');
    await post(g, 'pause', { all: true });
    await text(ALICE, 'STOP');

    expect(await list(g)).toEqual([]);
    expect(await list(g, 'left')).toMatchObject([{ phoneNumber: ALICE, status: 'unsubscribed' }]);
    expect((await post(g, 'resume', { all: true })).json().memberIds).toEqual([]);
    const sub = await database.collections.subscriptions.findOne({});
    expect(sub).toMatchObject({ status: 'unsubscribed', source: 'sms' });
    expect(sub!.pausedAt).toBeUndefined();
  });

  it('ends a pause when the member texts the keyword again', async () => {
    const g = await createGroup('ALPHA');
    await text(ALICE, 'ALPHA');
    await post(g, 'pause', { all: true });
    await text(ALICE, 'alpha');

    expect(await list(g)).toMatchObject([{ phoneNumber: ALICE, status: 'subscribed' }]);
    expect(await getGroup(g)).toMatchObject({ memberCount: 1, pausedCount: 0 });
  });

  it('rejects an unknown group and a bad body', async () => {
    const g = await createGroup('ALPHA');
    expect((await post(new ObjectId().toHexString(), 'pause', { all: true })).statusCode).toBe(404);
    expect((await post(g, 'pause', {})).statusCode).toBe(400);
    expect((await post(g, 'resume', { memberIds: ['nope'] })).statusCode).toBe(400);
  });
});

describe('member lists and copy/move with paused members', () => {
  it("keeps members moved to another group off the source's Left the group list", async () => {
    const a = await createGroup('ALPHA');
    const b = await createGroup('BETA');
    await text(ALICE, 'ALPHA');
    await text(BOB, 'ALPHA');
    await text(BOB, 'STOP');

    await app.inject({
      method: 'POST',
      url: `/api/groups/${a}/members/transfer`,
      payload: { targetGroupId: b, mode: 'move', all: true },
    });
    expect(await list(a)).toEqual([]);
    expect((await list(a, 'left')).map((r) => r.phoneNumber)).toEqual([BOB]);
  });

  it("doesn't copy paused members, and leaves members paused in the target alone", async () => {
    const a = await createGroup('ALPHA');
    const b = await createGroup('BETA');
    await text(ALICE, 'ALPHA');
    await text(BOB, 'ALPHA');
    await text(CAROL, 'ALPHA');
    await text(BOB, 'BETA');
    await post(b, 'pause', { all: true }); // Bob is paused in BETA
    await post(a, 'pause', { memberIds: [await memberId(CAROL)] }); // Carol is paused in ALPHA

    const res = await app.inject({
      method: 'POST',
      url: `/api/groups/${a}/members/transfer`,
      payload: { targetGroupId: b, mode: 'move', all: true },
    });
    expect(res.json()).toEqual({
      added: 1,
      alreadyInGroup: 0,
      skippedOptedOut: 0,
      skippedPaused: 1,
      removed: 1,
    });
    // Alice moved; Bob stays in ALPHA (he's paused in BETA); Carol, paused, didn't go.
    expect((await list(a)).map((r) => [r.phoneNumber, r.status])).toEqual([
      [BOB, 'subscribed'],
      [CAROL, 'paused'],
    ]);
    expect((await list(b)).map((r) => [r.phoneNumber, r.status])).toEqual([
      [ALICE, 'subscribed'],
      [BOB, 'paused'],
    ]);
  });
});
