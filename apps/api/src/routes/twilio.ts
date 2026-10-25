import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import twilio from 'twilio';
import { processInbound } from '../services/subscriptions.js';
import { recordStatus } from '../services/deliveries.js';
import type { TwilioService } from '../services/twilio.js';
import type { InboundMessageDoc } from '../db/documents.js';

const INBOUND_PATH = '/api/twilio/inbound';
/** Outbound sends pass this (on PUBLIC_BASE_URL) as their statusCallback. */
export const STATUS_CALLBACK_PATH = '/api/twilio/status';

// Twilio posts form-encoded fields; we only need a couple.
const inboundSchema = z.object({
  From: z.string().min(1),
  Body: z.string().default(''),
  // Set by Twilio's Advanced Opt-Out (STOP, START, or HELP) when it has already
  // sent its own reply.
  OptOutType: z.string().optional(),
});

const statusSchema = z.object({
  MessageSid: z.string().min(1),
  MessageStatus: z.string().min(1),
  // Only sent with failed/undelivered statuses, e.g. "30034".
  ErrorCode: z.string().optional(),
});

export interface TwilioRoutesDeps {
  twilio: TwilioService;
  orgName: string;
  supportEmail?: string;
  publicBaseUrl: string;
}

export async function twilioRoutes(
  fastify: FastifyInstance,
  deps: TwilioRoutesDeps,
): Promise<void> {
  const { collections } = fastify.mongo;

  /** Checks the request was signed by Twilio for the webhook at `path`. */
  function hasValidSignature(request: FastifyRequest, path: string): boolean {
    const params = (request.body ?? {}) as Record<string, unknown>;
    const url = new URL(path, deps.publicBaseUrl).toString();
    const signature = request.headers['x-twilio-signature'];
    return deps.twilio.validateSignature(
      Array.isArray(signature) ? signature[0] : signature,
      url,
      params,
    );
  }

  fastify.post(INBOUND_PATH, async (request, reply) => {
    if (!hasValidSignature(request, INBOUND_PATH)) {
      fastify.log.warn('Rejected inbound SMS: invalid Twilio signature');
      return reply.code(403).send('Invalid signature');
    }

    const parsed = inboundSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send('Bad request');
    }

    const result = await processInbound(
      { collections, orgName: deps.orgName, supportEmail: deps.supportEmail },
      parsed.data.From,
      parsed.data.Body,
    );

    const log: InboundMessageDoc = {
      _id: new ObjectId(),
      fromNumber: parsed.data.From,
      body: parsed.data.Body,
      matchedKeyword: result.matchedKeyword,
      action: result.action,
      receivedAt: new Date(),
    };
    await collections.inboundMessages.insertOne(log);
    // Joining or STOP changes who's in a group (HELP, START and the rest don't).
    if (result.action === 'join' || result.action === 'stop') fastify.events.notify('groups');

    const twiml = new twilio.twiml.MessagingResponse();
    // Twilio asks apps not to reply again to a keyword its opt-out handling answered.
    if (result.reply && !parsed.data.OptOutType) twiml.message(result.reply);
    return reply.header('Content-Type', 'text/xml').send(twiml.toString());
  });

  // Twilio reports each status change of an outbound message here.
  fastify.post(STATUS_CALLBACK_PATH, async (request, reply) => {
    if (!hasValidSignature(request, STATUS_CALLBACK_PATH)) {
      fastify.log.warn('Rejected status callback: invalid Twilio signature');
      return reply.code(403).send('Invalid signature');
    }

    const parsed = statusSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send('Bad request');
    }

    const { MessageSid, MessageStatus, ErrorCode } = parsed.data;
    const recorded = await recordStatus(collections.deliveries, {
      sid: MessageSid,
      status: MessageStatus,
      errorCode: ErrorCode || undefined,
    });
    if (recorded) {
      fastify.events.notify('messages'); // History's delivery counts
    } else {
      fastify.log.warn({ status: MessageStatus }, 'Ignored unrecognized Twilio message status');
    }
    return reply.code(204).send();
  });
}
