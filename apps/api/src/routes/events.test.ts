import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { ChangeEvent, ChangeTopic } from '@text-them/shared';
import { connectDatabase, type Database } from '../db/index.js';
import { buildApp, type BuildAppOptions } from '../app.js';
import { loadConfig } from '../config.js';
import { createChangeNotifier, type ChangeNotifier } from '../services/events.js';
import type { TwilioService } from '../services/twilio.js';
import type { EventRoutesOptions } from './events.js';

let mongod: MongoMemoryServer;
let database: Database;
let app: FastifyInstance;
let baseUrl: string;
let heard: ChangeTopic[];

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

/** An app listening on a real port, since `inject` can't read a stream that stays open. */
async function startApp(
  events: ChangeNotifier,
  eventStream: EventRoutesOptions,
  extra: Partial<BuildAppOptions> = {},
): Promise<{ app: FastifyInstance; baseUrl: string }> {
  const started = await buildApp({
    config,
    twilio: fakeTwilio,
    database,
    authenticator: () => 'user_123',
    events,
    eventStream,
    fastifyOptions: { logger: false },
    ...extra,
  });
  const address = await started.listen({ port: 0, host: '127.0.0.1' });
  return { app: started, baseUrl: address };
}

/** Reads `GET /api/events` one SSE block at a time. */
async function openStream(url: string) {
  const controller = new AbortController();
  const res = await fetch(`${url}/api/events`, { signal: controller.signal });
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  /** The next block (an event or a comment), or null once the stream ends. */
  async function next(): Promise<string | null> {
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        return block;
      }
      const { value, done } = await reader.read();
      if (done) return null;
      buffer += value;
    }
  }

  /** The next change notice, skipping comments. */
  async function nextEvent(): Promise<ChangeEvent> {
    for (;;) {
      const block = await next();
      if (block === null) throw new Error('Stream ended before a notice arrived');
      if (block.startsWith('data: ')) return JSON.parse(block.slice('data: '.length));
    }
  }

  return { res, next, nextEvent, close: () => controller.abort() };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

/** The topics announced while `action` ran. */
async function topicsFrom(action: () => Promise<unknown>): Promise<ChangeTopic[]> {
  await tick(); // let notices from earlier steps drain
  heard = [];
  await action();
  await tick();
  return [...new Set(heard)].sort();
}

function form(fields: Record<string, string>) {
  return {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(fields).toString(),
  };
}

function textIn(from: string, body: string) {
  return app.inject({
    method: 'POST',
    url: '/api/twilio/inbound',
    ...form({ From: from, Body: body }),
  });
}

async function insertGroup(keyword: string): Promise<ObjectId> {
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
  return _id;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  database = await connectDatabase(mongod.getUri(), 'test');
  // No throttling, so every change in a test is heard right away.
  const events = createChangeNotifier(0);
  events.subscribe((topic) => heard.push(topic));
  ({ app, baseUrl } = await startApp(
    events,
    { heartbeatMs: 50 },
    // After a test aborts a stream, Node's fetch keeps a spare connection open
    // that never sends a request, and that would hold app.close() open.
    { fastifyOptions: { logger: false, forceCloseConnections: true } },
  ));
});

afterAll(async () => {
  await app.close();
  await database.client.close();
  await mongod.stop();
});

beforeEach(async () => {
  heard = [];
  const { collections } = database;
  await Promise.all([
    collections.groups.deleteMany({}),
    collections.members.deleteMany({}),
    collections.subscriptions.deleteMany({}),
    collections.messages.deleteMany({}),
    collections.deliveries.deleteMany({}),
  ]);
});

describe('GET /api/events', () => {
  it('opens a Server-Sent Events stream right away', async () => {
    const stream = await openStream(baseUrl);
    expect(stream.res.status).toBe(200);
    expect(stream.res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(await stream.next()).toBe(': connected');
    stream.close();
  });

  it('turns away a request with no signed-in user', async () => {
    const signedOut = await buildApp({
      config,
      twilio: fakeTwilio,
      database,
      authenticator: () => null,
      fastifyOptions: { logger: false },
    });
    const res = await signedOut.inject({ method: 'GET', url: '/api/events' });
    expect(res.statusCode).toBe(401);
    await signedOut.close();
  });

  it('tells the dashboard when someone texts a group keyword', async () => {
    await insertGroup('DRAGON');
    const stream = await openStream(baseUrl);
    await textIn('+15550000001', 'dragon');
    expect(await stream.nextEvent()).toEqual({ topic: 'groups' });
    stream.close();
  });

  it('tells the dashboard when Twilio reports a delivery', async () => {
    const stream = await openStream(baseUrl);
    await app.inject({
      method: 'POST',
      url: '/api/twilio/status',
      ...form({ MessageSid: 'SM123', MessageStatus: 'delivered' }),
    });
    expect(await stream.nextEvent()).toEqual({ topic: 'messages' });
    stream.close();
  });

  it('sends a heartbeat while nothing changes', async () => {
    const stream = await openStream(baseUrl);
    expect(await stream.next()).toBe(': connected');
    expect(await stream.next()).toBe(': ping');
    stream.close();
  });

  it('keeps serving the other streams after one disconnects', async () => {
    await insertGroup('DRAGON');
    const gone = await openStream(baseUrl);
    const staying = await openStream(baseUrl);
    gone.close();
    await tick();
    await textIn('+15550000001', 'DRAGON');
    expect(await staying.nextEvent()).toEqual({ topic: 'groups' });
    staying.close();
  });

  it('ends a stream after its maximum age so the dashboard rechecks sign-in', async () => {
    const short = await startApp(createChangeNotifier(0), { maxStreamMs: 100 });
    const stream = await openStream(short.baseUrl);
    expect(await stream.next()).toBe(': connected');
    expect(await stream.next()).toBeNull();
    await short.app.close();
  });

  it('ends open streams when the app shuts down, so a deploy is not held up', async () => {
    const closing = await startApp(createChangeNotifier(0), {});
    const stream = await openStream(closing.baseUrl);
    expect(await stream.next()).toBe(': connected');
    await closing.app.close();
    expect(await stream.next()).toBeNull();
  });
});

describe('change notices', () => {
  it('announces groups when a group is created, edited, or deleted', async () => {
    let id = '';
    expect(
      await topicsFrom(async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/api/groups',
          payload: { name: 'Dragons', keyword: 'dragon' },
        });
        id = res.json().group.id;
      }),
    ).toEqual(['groups']);

    expect(
      await topicsFrom(() =>
        app.inject({ method: 'PATCH', url: `/api/groups/${id}`, payload: { name: 'Big dragons' } }),
      ),
    ).toEqual(['groups']);

    // Deleting also cancels the group's scheduled broadcasts.
    expect(
      await topicsFrom(() => app.inject({ method: 'DELETE', url: `/api/groups/${id}` })),
    ).toEqual(['groups', 'messages']);
  });

  it('announces every text received, and groups when someone joins or texts STOP', async () => {
    await insertGroup('DRAGON');
    expect(await topicsFrom(() => textIn('+15550000001', 'DRAGON'))).toEqual(['groups', 'inbound']);
    expect(await topicsFrom(() => textIn('+15550000001', 'STOP'))).toEqual(['groups', 'inbound']);
    expect(await topicsFrom(() => textIn('+15550000001', 'HELP'))).toEqual(['inbound']);
    expect(await topicsFrom(() => textIn('+15550000001', 'START'))).toEqual(['inbound']);
    expect(await topicsFrom(() => textIn('+15550000001', 'NOPE'))).toEqual(['inbound']);
  });

  it('announces messages when a broadcast is sent, scheduled, edited, or canceled', async () => {
    const groupId = (await insertGroup('DRAGON')).toHexString();
    expect(
      await topicsFrom(() =>
        app.inject({
          method: 'POST',
          url: `/api/groups/${groupId}/broadcast`,
          payload: { body: 'Hello now' },
        }),
      ),
    ).toEqual(['messages']);

    let id = '';
    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(
      await topicsFrom(async () => {
        const res = await app.inject({
          method: 'POST',
          url: `/api/groups/${groupId}/broadcast`,
          payload: { body: 'Hello later', sendAt },
        });
        id = res.json().message.id;
      }),
    ).toEqual(['messages']);

    expect(
      await topicsFrom(() =>
        app.inject({ method: 'PATCH', url: `/api/messages/${id}`, payload: { body: 'Edited' } }),
      ),
    ).toEqual(['messages']);

    expect(
      await topicsFrom(() => app.inject({ method: 'POST', url: `/api/messages/${id}/cancel` })),
    ).toEqual(['messages']);
  });

  it('announces messages when the scheduler sends a due broadcast', async () => {
    const groupId = await insertGroup('DRAGON');
    await database.collections.messages.insertOne({
      _id: new ObjectId(),
      groupId,
      body: 'Due now',
      sentByUserId: 'user_123',
      status: 'scheduled',
      scheduledFor: new Date(Date.now() - 1000),
      recipientCount: 0,
      acceptedCount: 0,
      failedCount: 0,
    });

    const events = createChangeNotifier(0);
    const schedulerHeard: ChangeTopic[] = [];
    events.subscribe((topic) => schedulerHeard.push(topic));
    // The scheduler's first pass runs as soon as the app is ready.
    const withScheduler = await startApp(events, {}, { schedulerIntervalMs: 60_000 });
    await withScheduler.app.close(); // waits for that pass to finish

    expect(schedulerHeard).toEqual(['messages']);
    const sent = await database.collections.messages.findOne({ body: 'Due now' });
    expect(sent?.status).toBe('sent');
  });
});
