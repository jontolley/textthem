import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDatabase, type Database } from '../db/index.js';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import type { TwilioService } from '../services/twilio.js';

let mongod: MongoMemoryServer;
let database: Database;

const twilio = {} as TwilioService; // never called by these routes

const baseEnv = {
  MONGODB_URI: 'mongodb://unused',
  TWILIO_ACCOUNT_SID: 'AC_test',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_MESSAGING_SERVICE_SID: 'MG_test',
  CLERK_SECRET_KEY: 'sk_test',
  CLERK_PUBLISHABLE_KEY: 'pk_test',
};

async function getVersion(env: Record<string, string>, userId: string | null) {
  const app = await buildApp({
    config: loadConfig({ ...baseEnv, ...env } as NodeJS.ProcessEnv),
    twilio,
    database,
    authenticator: () => userId,
    fastifyOptions: { logger: false },
  });
  const res = await app.inject({ method: 'GET', url: '/api/version' });
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

describe('GET /api/version', () => {
  it('reports the commit and build time stamped into the image', async () => {
    const res = await getVersion(
      { GIT_SHA: '6af433d0123456789abcdef0123456789abcdef0', BUILT_AT: '2026-10-24T01:15:00Z' },
      'user_123',
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      api: { commit: '6af433d0123456789abcdef0123456789abcdef0', builtAt: '2026-10-24T01:15:00Z' },
    });
  });

  it('reports nulls for an unstamped local build', async () => {
    // Docker sets an empty string when the build arg wasn't passed.
    const res = await getVersion({ GIT_SHA: '', BUILT_AT: '' }, 'user_123');
    expect(res.json()).toEqual({ api: { commit: null, builtAt: null } });
  });

  it('requires sign-in', async () => {
    const res = await getVersion({ GIT_SHA: 'abc' }, null);
    expect(res.statusCode).toBe(401);
  });
});
