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
