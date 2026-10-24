import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDatabase, type Database } from '../db/index.js';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import type { TwilioService } from '../services/twilio.js';

let mongod: MongoMemoryServer;
let database: Database;

const twilio = {} as TwilioService; // never called by these routes

async function request(organizers: string, userId: string | null, url: string) {
  const app = await buildApp({
    config: loadConfig({
      MONGODB_URI: 'mongodb://unused',
      TWILIO_ACCOUNT_SID: 'AC_test',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_MESSAGING_SERVICE_SID: 'MG_test',
      CLERK_SECRET_KEY: 'sk_test',
      CLERK_PUBLISHABLE_KEY: 'pk_test',
      ORGANIZER_USER_IDS: organizers,
    } as NodeJS.ProcessEnv),
    twilio,
    database,
    authenticator: () => userId,
    fastifyOptions: { logger: false },
  });
  const res = await app.inject({ method: 'GET', url });
  await app.close();
  return res;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  database = await connectDatabase(mongod.getUri(), 'test');
});

afterAll(async () => {
  await database.client.close();
  await mongod.stop();
});

describe('organizer allowlist', () => {
  it('lets an organizer in and tells the dashboard who they are', async () => {
    const res = await request('user_a,user_b', 'user_b', '/api/me');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'user_b' });
  });

  it.each(['/api/me', '/api/groups', '/api/messages', '/api/version'])(
    'refuses a signed-in non-organizer on %s with 403',
    async (url) => {
      const res = await request('user_a', 'user_intruder', url);
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('forbidden');
    },
  );

  it('still answers 401 when nobody is signed in', async () => {
    const res = await request('user_a', null, '/api/me');
    expect(res.statusCode).toBe(401);
  });

  it('lets any signed-in user in when no organizers are configured (local dev)', async () => {
    const res = await request('', 'user_anyone', '/api/groups');
    expect(res.statusCode).toBe(200);
  });
});
