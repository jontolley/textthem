import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = {
  MONGODB_URI: 'mongodb://localhost:27017',
  TWILIO_ACCOUNT_SID: 'AC_test',
  TWILIO_AUTH_TOKEN: 'token',
  CLERK_SECRET_KEY: 'sk_test',
  CLERK_PUBLISHABLE_KEY: 'pk_test',
} as NodeJS.ProcessEnv;

describe('loadConfig — outbound sender', () => {
  it('accepts a plain from-number alone', () => {
    const config = loadConfig({ ...base, TWILIO_FROM_NUMBER: '+15551234567' });
    expect(config.TWILIO_FROM_NUMBER).toBe('+15551234567');
    expect(config.TWILIO_MESSAGING_SERVICE_SID).toBeUndefined();
  });

  it('accepts a messaging service SID alone', () => {
    const config = loadConfig({ ...base, TWILIO_MESSAGING_SERVICE_SID: 'MG_test' });
    expect(config.TWILIO_MESSAGING_SERVICE_SID).toBe('MG_test');
  });

  it('throws when neither sender is configured', () => {
    expect(() => loadConfig(base)).toThrow(/TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER/);
  });
});

describe('loadConfig — organizer allowlist', () => {
  const env = { ...base, TWILIO_MESSAGING_SERVICE_SID: 'MG_test' } as NodeJS.ProcessEnv;

  it('parses a comma-separated list of Clerk user IDs', () => {
    const config = loadConfig({ ...env, ORGANIZER_USER_IDS: ' user_a, user_b ,' });
    expect(config.ORGANIZER_USER_IDS).toEqual(['user_a', 'user_b']);
  });

  it('allows an empty list outside production', () => {
    expect(loadConfig(env).ORGANIZER_USER_IDS).toEqual([]);
  });

  it('refuses to start in production without organizers', () => {
    expect(() => loadConfig({ ...env, NODE_ENV: 'production' })).toThrow(/ORGANIZER_USER_IDS/);
  });
});
