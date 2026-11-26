import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { connectDatabase, ensureDefaultOrg, type Database } from '../db/index.js';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import type { TwilioService } from '../services/twilio.js';

let mongod: MongoMemoryServer;
let database: Database;
let app: FastifyInstance;

const fakeTwilio: TwilioService = {
  validateSignature: () => true,
  async sendSms(to) {
    return { to, sid: `SM${new ObjectId().toHexString()}`, status: 'accepted' };
  },
  async sendBulk(recipients) {
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
  DEFAULT_ORG_SLUG: 'test-org',
};

const ALICE = '+15550000001';
const BOB = '+15550000002';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  database = await connectDatabase(mongod.getUri(), 'test');
  app = await buildApp({
    config: loadConfig(baseEnv as NodeJS.ProcessEnv),
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
  const { collections } = database;
  await Promise.all([
    collections.groups.deleteMany({}),
    collections.members.deleteMany({}),
    collections.subscriptions.deleteMany({}),
    collections.inboundMessages.deleteMany({}),
  ]);
});

async function createGroup(keyword: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/groups',
    payload: { name: keyword, keyword },
  });
  expect(res.statusCode).toBe(201);
  return res.json().group.id;
}

async function text(from: string, body: string) {
  await app.inject({ method: 'POST', url: '/api/twilio/inbound', payload: { From: from, Body: body } });
}

async function memberId(phone: string): Promise<string> {
  const m = await database.collections.members.findOne({ phoneNumber: phone });
  return m!._id.toHexString();
}

async function subscribedPhones(groupId: string): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: `/api/groups/${groupId}/members?sort=phone` });
  return res.json().members.map((m: { phoneNumber: string }) => m.phoneNumber);
}

function transfer(sourceId: string, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: `/api/groups/${sourceId}/members/transfer`,
    payload,
  });
}

describe('organizations', () => {
  it('puts new groups in the default org', async () => {
    const id = await createGroup('DRAGON');
    const org = await database.collections.organizations.findOne({ slug: 'test-org' });
    const res = await app.inject({ method: 'GET', url: `/api/groups/${id}` });
    expect(res.json().group.orgId).toBe(org!._id.toHexString());
  });

  it('gives groups from before orgs the default org, and only creates it once', async () => {
    const { collections } = database;
    const legacyId = new ObjectId();
    // A group saved before orgs existed has no orgId.
    await collections.groups.insertOne({
      _id: legacyId,
      name: 'Old',
      keyword: 'OLD',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const first = await ensureDefaultOrg(collections, { slug: 'test-org', name: 'Test Org' });
    const second = await ensureDefaultOrg(collections, { slug: 'test-org', name: 'Test Org' });
    expect(second.equals(first)).toBe(true);
    expect(await collections.organizations.countDocuments({ slug: 'test-org' })).toBe(1);
    const legacy = await collections.groups.findOne({ _id: legacyId });
    expect(legacy!.orgId.equals(first)).toBe(true);
  });
});

describe('POST /api/groups/:id/members/transfer', () => {
  it('copies members and leaves them in the source group', async () => {
    const a = await createGroup('ALPHA');
    const b = await createGroup('BETA');
    await text(ALICE, 'ALPHA');
    await text(BOB, 'ALPHA');

    const res = await transfer(a, { targetGroupId: b, mode: 'copy', memberIds: [await memberId(ALICE)] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ added: 1, alreadyInGroup: 0, skippedOptedOut: 0, skippedPaused: 0, removed: 0 });
    expect(await subscribedPhones(a)).toEqual([ALICE, BOB]);
    expect(await subscribedPhones(b)).toEqual([ALICE]);

    const sub = await database.collections.subscriptions.findOne({ groupId: new ObjectId(b) });
    expect(sub).toMatchObject({ status: 'subscribed', source: 'admin' });
  });

  it('moves members, recording the removal as an organizer action', async () => {
    const a = await createGroup('ALPHA');
    const b = await createGroup('BETA');
    await text(ALICE, 'ALPHA');
    await text(BOB, 'ALPHA');

    const res = await transfer(a, { targetGroupId: b, mode: 'move', all: true });
    expect(res.json()).toEqual({ added: 2, alreadyInGroup: 0, skippedOptedOut: 0, skippedPaused: 0, removed: 2 });
    expect(await subscribedPhones(a)).toEqual([]);
    expect(await subscribedPhones(b)).toEqual([ALICE, BOB]);

    const left = await database.collections.subscriptions.findOne({ groupId: new ObjectId(a) });
    expect(left).toMatchObject({ status: 'unsubscribed', source: 'admin' });
    expect(left!.unsubscribedAt).toBeInstanceOf(Date);
  });

  it('can move someone back to a group an organizer moved them out of', async () => {
    const a = await createGroup('ALPHA');
    const b = await createGroup('BETA');
    await text(ALICE, 'ALPHA');

    await transfer(a, { targetGroupId: b, mode: 'move', all: true });
    const res = await transfer(b, { targetGroupId: a, mode: 'move', all: true });
    expect(res.json()).toEqual({ added: 1, alreadyInGroup: 0, skippedOptedOut: 0, skippedPaused: 0, removed: 1 });
    expect(await subscribedPhones(a)).toEqual([ALICE]);
    expect(await subscribedPhones(b)).toEqual([]);
  });

  it('never adds back someone who opted out of the target, and keeps them in the source on a move', async () => {
    const a = await createGroup('ALPHA');
    const b = await createGroup('BETA');
    await text(ALICE, 'ALPHA');
    await text(ALICE, 'BETA');
    await text(ALICE, 'STOP'); // leaves both
    await text(ALICE, 'ALPHA'); // rejoins only ALPHA

    const res = await transfer(a, { targetGroupId: b, mode: 'move', all: true });
    expect(res.json()).toEqual({ added: 0, alreadyInGroup: 0, skippedOptedOut: 1, skippedPaused: 0, removed: 0 });
    expect(await subscribedPhones(a)).toEqual([ALICE]);
    expect(await subscribedPhones(b)).toEqual([]);
  });

  it("counts members already in the target and doesn't duplicate them", async () => {
    const a = await createGroup('ALPHA');
    const b = await createGroup('BETA');
    await text(ALICE, 'ALPHA');
    await text(ALICE, 'BETA');
    await text(BOB, 'ALPHA');

    const res = await transfer(a, { targetGroupId: b, mode: 'move', all: true });
    expect(res.json()).toEqual({ added: 1, alreadyInGroup: 1, skippedOptedOut: 0, skippedPaused: 0, removed: 2 });
    expect(await subscribedPhones(b)).toEqual([ALICE, BOB]);
    expect(
      await database.collections.subscriptions.countDocuments({ groupId: new ObjectId(b) }),
    ).toBe(2);
  });

  it('ignores ids of people who are not current members of the source', async () => {
    const a = await createGroup('ALPHA');
    const b = await createGroup('BETA');
    const c = await createGroup('GAMMA');
    await text(ALICE, 'GAMMA');

    const res = await transfer(a, {
      targetGroupId: b,
      mode: 'copy',
      memberIds: [await memberId(ALICE), new ObjectId().toHexString()],
    });
    expect(res.json()).toEqual({ added: 0, alreadyInGroup: 0, skippedOptedOut: 0, skippedPaused: 0, removed: 0 });
    expect(await subscribedPhones(b)).toEqual([]);
    expect(await subscribedPhones(c)).toEqual([ALICE]);
  });

  it('refuses a target group in another organization', async () => {
    const a = await createGroup('ALPHA');
    await text(ALICE, 'ALPHA');
    const otherOrg = new ObjectId();
    const foreign = new ObjectId();
    await database.collections.groups.insertOne({
      _id: foreign,
      orgId: otherOrg,
      name: 'Elsewhere',
      keyword: 'ELSEWHERE',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await transfer(a, { targetGroupId: foreign.toHexString(), mode: 'copy', all: true });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/same organization/);
    expect(
      await database.collections.subscriptions.countDocuments({ groupId: foreign }),
    ).toBe(0);
  });

  it('rejects the same group, a missing target, and a bad body', async () => {
    const a = await createGroup('ALPHA');
    expect((await transfer(a, { targetGroupId: a, mode: 'copy', all: true })).statusCode).toBe(400);
    expect(
      (await transfer(a, { targetGroupId: new ObjectId().toHexString(), mode: 'copy', all: true }))
        .statusCode,
    ).toBe(404);
    const b = await createGroup('BETA');
    // Neither memberIds nor all, then both.
    expect((await transfer(a, { targetGroupId: b, mode: 'copy' })).statusCode).toBe(400);
    expect(
      (await transfer(a, { targetGroupId: b, mode: 'copy', all: true, memberIds: [b] })).statusCode,
    ).toBe(400);
    expect((await transfer(a, { targetGroupId: b, mode: 'swap', all: true })).statusCode).toBe(400);
  });
});
