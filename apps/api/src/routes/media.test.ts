import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import type { FastifyInstance } from 'fastify';
import { MAX_BROADCAST_IMAGES } from '@text-them/shared';
import { connectDatabase, type Database } from '../db/index.js';
import { buildApp, type BuildAppOptions } from '../app.js';
import { loadConfig } from '../config.js';
import { runDueBroadcasts } from '../services/broadcasts.js';
import { createLocalMediaStore, type MediaStore } from '../services/media.js';
import type { SendOptions, TwilioService } from '../services/twilio.js';

const MEDIA_BASE = 'https://media.textthem.test/';
const MINUTE = 60 * 1000;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

let mongod: MongoMemoryServer;
let database: Database;
let app: FastifyInstance;
let stored: { bytes: Buffer; contentType: string }[];
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

const fakeMedia: MediaStore = {
  async put(bytes, contentType) {
    stored.push({ bytes, contentType });
    return `${MEDIA_BASE}broadcasts/${stored.length}.png`;
  },
  owns: (url) => url.startsWith(MEDIA_BASE),
};

const config = loadConfig({
  MONGODB_URI: 'mongodb://unused',
  TWILIO_ACCOUNT_SID: 'AC_test',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_MESSAGING_SERVICE_SID: 'MG_test',
  CLERK_SECRET_KEY: 'sk_test',
  CLERK_PUBLISHABLE_KEY: 'pk_test',
  PUBLIC_BASE_URL: 'https://api.textthem.test',
} as NodeJS.ProcessEnv);

async function makeApp(extra: Partial<BuildAppOptions>): Promise<FastifyInstance> {
  const built = await buildApp({
    config,
    twilio: fakeTwilio,
    database,
    authenticator: () => 'user_123',
    users: async () => new Map(),
    fastifyOptions: { logger: false },
    ...extra,
  });
  await built.ready();
  return built;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  database = await connectDatabase(mongod.getUri(), 'test');
  app = await makeApp({ media: fakeMedia });
});

afterAll(async () => {
  await app.close();
  await database.client.close();
  await mongod.stop();
});

beforeEach(async () => {
  stored = [];
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

async function seedGroup(phone = '+15550000001'): Promise<string> {
  const now = new Date();
  const groupId = new ObjectId();
  const memberId = new ObjectId();
  await database.collections.groups.insertOne({
    _id: groupId,
    name: 'Dragons',
    keyword: 'DRAGON',
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  await database.collections.members.insertOne({
    _id: memberId,
    phoneNumber: phone,
    createdAt: now,
  });
  await database.collections.subscriptions.insertOne({
    _id: new ObjectId(),
    memberId,
    groupId,
    status: 'subscribed',
    source: 'sms',
    subscribedAt: now,
  });
  return groupId.toHexString();
}

function upload(bytes: Buffer, contentType: string, on = app) {
  return on.inject({
    method: 'POST',
    url: '/api/media',
    headers: { 'content-type': contentType },
    payload: bytes,
  });
}

function broadcast(groupId: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: `/api/groups/${groupId}/broadcast`, payload });
}

function edit(id: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'PATCH', url: `/api/messages/${id}`, payload });
}

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * MINUTE).toISOString();

describe('image uploads', () => {
  it('stores an image and returns its URL', async () => {
    const res = await upload(PNG, 'image/png');
    expect(res.statusCode).toBe(201);
    expect(res.json().mediaUrl).toBe(`${MEDIA_BASE}broadcasts/1.png`);
    expect(stored).toEqual([{ bytes: PNG, contentType: 'image/png' }]);
  });

  it("refuses a file that isn't the type it claims", async () => {
    const res = await upload(JPEG, 'image/png');
    expect(res.statusCode).toBe(400);
    expect(stored).toHaveLength(0);
  });

  it('refuses other file types', async () => {
    const res = await upload(Buffer.from('hello'), 'image/webp');
    expect(res.statusCode).toBe(415);
  });

  it('refuses images over 5 MB', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(big, 'image/png');
    expect(res.statusCode).toBe(413);
    expect(res.json().message).toBe('That file is too large');
  });

  it('says images are unavailable when the server has nowhere to keep them', async () => {
    const bare = await makeApp({});
    try {
      expect((await upload(PNG, 'image/png', bare)).statusCode).toBe(503);
      const me = await bare.inject({ method: 'GET', url: '/api/me' });
      expect(me.json().canAttachImages).toBe(false);
    } finally {
      await bare.close();
    }
  });

  it('tells the dashboard images can be attached', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/me' });
    expect(me.json()).toEqual({ userId: 'user_123', canAttachImages: true });
  });
});

describe('broadcasts with images', () => {
  it('sends the images with the text as one MMS, in order', async () => {
    const groupId = await seedGroup();
    const mediaUrls = [`${MEDIA_BASE}broadcasts/a.png`, `${MEDIA_BASE}broadcasts/b.png`];
    const res = await broadcast(groupId, { body: 'Look!', mediaUrls });

    expect(res.statusCode).toBe(201);
    expect(res.json().message).toMatchObject({ body: 'Look!', mediaUrls, status: 'sent' });
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].options?.mediaUrls).toEqual(mediaUrls);
  });

  it('can send an image with no text', async () => {
    const groupId = await seedGroup();
    const res = await broadcast(groupId, {
      body: '',
      mediaUrls: [`${MEDIA_BASE}broadcasts/a.png`],
    });
    expect(res.statusCode).toBe(201);
    expect(sendCalls[0].body).toBe('');
  });

  it('sends text-only broadcasts without media', async () => {
    const groupId = await seedGroup();
    const res = await broadcast(groupId, { body: 'Just words', mediaUrls: [] });
    expect(res.json().message.mediaUrls).toBeUndefined();
    expect(sendCalls[0].options?.mediaUrls).toBeUndefined();
  });

  it('needs text or an image', async () => {
    const groupId = await seedGroup();
    const res = await broadcast(groupId, { body: '   ', mediaUrls: [] });
    expect(res.statusCode).toBe(400);
    expect(sendCalls).toHaveLength(0);
  });

  it(`takes at most ${MAX_BROADCAST_IMAGES} images`, async () => {
    const groupId = await seedGroup();
    const mediaUrls = Array.from(
      { length: MAX_BROADCAST_IMAGES + 1 },
      (_, i) => `${MEDIA_BASE}broadcasts/${i}.png`,
    );
    const res = await broadcast(groupId, { body: 'Hi', mediaUrls });
    expect(res.statusCode).toBe(400);
    expect(sendCalls).toHaveLength(0);
  });

  it("refuses an image URL this server didn't store", async () => {
    const groupId = await seedGroup();
    const res = await broadcast(groupId, {
      body: 'Hi',
      mediaUrls: [`${MEDIA_BASE}broadcasts/a.png`, 'https://elsewhere.test/x.png'],
    });
    expect(res.statusCode).toBe(400);
    expect(sendCalls).toHaveLength(0);
  });

  it('sends a scheduled broadcast with its images', async () => {
    const groupId = await seedGroup();
    const mediaUrls = [`${MEDIA_BASE}broadcasts/later.png`, `${MEDIA_BASE}broadcasts/too.png`];
    await broadcast(groupId, { body: 'Later', mediaUrls, sendAt: inMinutes(5) });

    await runDue();
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].options?.mediaUrls).toEqual(mediaUrls);
  });

  it('still sends and shows an older broadcast saved with a single image', async () => {
    const groupId = await seedGroup();
    const mediaUrl = `${MEDIA_BASE}broadcasts/old.png`;
    const res = await broadcast(groupId, { body: 'Old', sendAt: inMinutes(5) });
    const _id = new ObjectId(res.json().message.id as string);
    await database.collections.messages.updateOne({ _id }, { $set: { mediaUrl } });

    await runDue();
    expect(sendCalls[0].options?.mediaUrls).toEqual([mediaUrl]);
    const list = await app.inject({ method: 'GET', url: '/api/messages' });
    expect(list.json().messages[0].mediaUrls).toEqual([mediaUrl]);
  });

  function runDue() {
    return runDueBroadcasts(
      {
        collections: database.collections,
        twilio: fakeTwilio,
        statusCallbackUrl: 'https://x.test/s',
      },
      new Date(Date.now() + 6 * MINUTE),
    );
  }
});

describe('editing a scheduled broadcast’s images', () => {
  async function scheduled(payload: Record<string, unknown>): Promise<string> {
    const groupId = await seedGroup();
    const res = await broadcast(groupId, { ...payload, sendAt: inMinutes(30) });
    expect(res.statusCode).toBe(201);
    return res.json().message.id;
  }

  const one = `${MEDIA_BASE}broadcasts/1.png`;
  const two = `${MEDIA_BASE}broadcasts/2.png`;

  it('adds, replaces and removes the images', async () => {
    const id = await scheduled({ body: 'Hello' });

    expect((await edit(id, { mediaUrls: [one] })).json().message.mediaUrls).toEqual([one]);
    expect((await edit(id, { mediaUrls: [two, one] })).json().message.mediaUrls).toEqual([
      two,
      one,
    ]);
    const removed = await edit(id, { mediaUrls: [] });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().message.mediaUrls).toBeUndefined();
    const doc = await database.collections.messages.findOne({ _id: new ObjectId(id) });
    expect(doc && 'mediaUrls' in doc).toBe(false);
  });

  it("replaces an older broadcast's single image", async () => {
    const id = await scheduled({ body: 'Hello' });
    const _id = new ObjectId(id);
    await database.collections.messages.updateOne({ _id }, { $set: { mediaUrl: one } });

    const res = await edit(id, { mediaUrls: [two] });
    expect(res.json().message.mediaUrls).toEqual([two]);
    const doc = await database.collections.messages.findOne({ _id });
    expect(doc && 'mediaUrl' in doc).toBe(false);
  });

  it('can clear the text when there is an image', async () => {
    const id = await scheduled({ body: 'Hello', mediaUrls: [one] });
    const res = await edit(id, { body: '' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message.body).toBe('');
  });

  it('can clear the text of an older broadcast with a single image', async () => {
    const id = await scheduled({ body: 'Hello' });
    await database.collections.messages.updateOne(
      { _id: new ObjectId(id) },
      { $set: { mediaUrl: one } },
    );
    expect((await edit(id, { body: '' })).statusCode).toBe(200);
  });

  it("won't remove the images when there's no text", async () => {
    const id = await scheduled({ body: '', mediaUrls: [one, two] });
    const res = await edit(id, { mediaUrls: [] });
    expect(res.statusCode).toBe(400);
    const doc = await database.collections.messages.findOne({ _id: new ObjectId(id) });
    expect(doc?.mediaUrls).toEqual([one, two]);
  });

  it("won't clear the text when there's no image", async () => {
    const id = await scheduled({ body: 'Hello' });
    expect((await edit(id, { body: '' })).statusCode).toBe(400);
  });

  it("won't clear both at once", async () => {
    const id = await scheduled({ body: 'Hello', mediaUrls: [one] });
    expect((await edit(id, { body: '', mediaUrls: [] })).statusCode).toBe(400);
  });

  it("still says it's no longer scheduled once it has gone out", async () => {
    const id = await scheduled({ body: 'Hello', mediaUrls: [one] });
    await database.collections.messages.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'sent' } },
    );
    expect((await edit(id, { mediaUrls: [] })).statusCode).toBe(409);
  });
});

describe('local image store (dev)', () => {
  let dir: string;
  let local: FastifyInstance;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'textthem-media-'));
    local = await makeApp({ media: createLocalMediaStore(dir, 'http://localhost:8080') });
  });

  afterAll(async () => {
    await local.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('serves what it stores, publicly', async () => {
    const up = await upload(PNG, 'image/png', local);
    const url = new URL(up.json().mediaUrl);
    expect(url.origin).toBe('http://localhost:8080');

    const res = await local.inject({ method: 'GET', url: url.pathname });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.rawPayload.equals(PNG)).toBe(true);
  });

  it("serves nothing it didn't store", async () => {
    for (const name of ['nope.png', '..%2F..%2Fetc%2Fpasswd', `${'0'.repeat(36)}.png`]) {
      const res = await local.inject({ method: 'GET', url: `/media/${name}` });
      expect(res.statusCode).toBe(404);
    }
  });
});
