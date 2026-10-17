import twilio from 'twilio';
import type { AppConfig } from '../config.js';

export interface SendOptions {
  /** URL Twilio POSTs this message's delivery status updates to. */
  statusCallback?: string;
}

/** A send Twilio's API accepted. Delivery is reported later via status callback. */
export interface SentMessage {
  to: string;
  /** Twilio Message SID (SM…); status callbacks reference it. */
  sid: string;
  /** Twilio's status at acceptance, e.g. "accepted" or "queued". */
  status: string;
}

export interface SendResult {
  accepted: SentMessage[];
  /** Number of sends Twilio's API rejected outright. */
  failed: number;
}

/**
 * Abstraction over Twilio so routes don't depend on the SDK directly and tests
 * can substitute a fake. One concrete implementation talks to Twilio; tests use
 * an in-memory stub.
 */
export interface TwilioService {
  /** Validates a Twilio webhook signature (inbound SMS and status callbacks). */
  validateSignature(signature: string | undefined, url: string, params: Record<string, unknown>): boolean;
  /** Sends a single SMS. Returns the accepted message, or null if Twilio rejected it. */
  sendSms(to: string, body: string, options?: SendOptions): Promise<SentMessage | null>;
  /** Sends the same body to many recipients, tolerating individual failures. */
  sendBulk(recipients: string[], body: string, options?: SendOptions): Promise<SendResult>;
}

export function createTwilioService(config: AppConfig): TwilioService {
  const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

  // Prefer a Messaging Service when configured; otherwise send from a plain
  // number. Config validation guarantees at least one is present.
  const sender = config.TWILIO_MESSAGING_SERVICE_SID
    ? { messagingServiceSid: config.TWILIO_MESSAGING_SERVICE_SID }
    : { from: config.TWILIO_FROM_NUMBER };

  async function sendSms(
    to: string,
    body: string,
    options: SendOptions = {},
  ): Promise<SentMessage | null> {
    try {
      const msg = await client.messages.create({
        to,
        body,
        ...sender,
        ...(options.statusCallback ? { statusCallback: options.statusCallback } : {}),
      });
      return { to, sid: msg.sid, status: msg.status };
    } catch {
      return null;
    }
  }

  return {
    validateSignature(signature, url, params) {
      if (config.TWILIO_SKIP_SIGNATURE_VALIDATION) return true;
      if (!signature) return false;
      return twilio.validateRequest(config.TWILIO_AUTH_TOKEN, signature, url, params);
    },

    sendSms,

    async sendBulk(recipients, body, options) {
      const results = await Promise.all(recipients.map((to) => sendSms(to, body, options)));
      const accepted = results.filter((r): r is SentMessage => r !== null);
      return { accepted, failed: results.length - accepted.length };
    },
  };
}
