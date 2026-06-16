import twilio from 'twilio';
import type { AppConfig } from '../config.js';

export interface SendResult {
  accepted: number;
  failed: number;
}

/**
 * Abstraction over Twilio so routes don't depend on the SDK directly and tests
 * can substitute a fake. One concrete implementation talks to Twilio; tests use
 * an in-memory stub.
 */
export interface TwilioService {
  /** Validates an inbound webhook signature. */
  validateSignature(signature: string | undefined, url: string, params: Record<string, unknown>): boolean;
  /** Sends a single SMS. Returns true if Twilio accepted (queued) it. */
  sendSms(to: string, body: string): Promise<boolean>;
  /** Sends the same body to many recipients, tolerating individual failures. */
  sendBulk(recipients: string[], body: string): Promise<SendResult>;
}

export function createTwilioService(config: AppConfig): TwilioService {
  const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

  // Prefer a Messaging Service when configured; otherwise send from a plain
  // number. Config validation guarantees at least one is present.
  const sender = config.TWILIO_MESSAGING_SERVICE_SID
    ? { messagingServiceSid: config.TWILIO_MESSAGING_SERVICE_SID }
    : { from: config.TWILIO_FROM_NUMBER };

  async function sendSms(to: string, body: string): Promise<boolean> {
    try {
      await client.messages.create({ to, body, ...sender });
      return true;
    } catch {
      return false;
    }
  }

  return {
    validateSignature(signature, url, params) {
      if (config.TWILIO_SKIP_SIGNATURE_VALIDATION) return true;
      if (!signature) return false;
      return twilio.validateRequest(config.TWILIO_AUTH_TOKEN, signature, url, params);
    },

    sendSms,

    async sendBulk(recipients, body) {
      const results = await Promise.all(recipients.map((to) => sendSms(to, body)));
      const accepted = results.filter(Boolean).length;
      return { accepted, failed: results.length - accepted };
    },
  };
}
