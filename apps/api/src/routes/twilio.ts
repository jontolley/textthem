import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import twilio from 'twilio';
import { processInbound } from '../services/subscriptions.js';
import type { TwilioService } from '../services/twilio.js';
import type { InboundMessageDoc } from '../db/documents.js';

const INBOUND_PATH = '/api/twilio/inbound';

// Twilio posts form-encoded fields; we only need a couple.
const inboundSchema = z.object({
  From: z.string().min(1),
  Body: z.string().default(''),
});

export interface TwilioRoutesDeps {
  twilio: TwilioService;
  orgName: string;
  publicBaseUrl: string;
}

export async function twilioRoutes(
  fastify: FastifyInstance,
  deps: TwilioRoutesDeps,
): Promise<void> {
  const { collections } = fastify.mongo;

  fastify.post(INBOUND_PATH, async (request, reply) => {
    const params = (request.body ?? {}) as Record<string, unknown>;
    const url = new URL(INBOUND_PATH, deps.publicBaseUrl).toString();
    const signature = request.headers['x-twilio-signature'];

    if (
      !deps.twilio.validateSignature(
        Array.isArray(signature) ? signature[0] : signature,
        url,
        params,
      )
    ) {
      fastify.log.warn('Rejected inbound SMS: invalid Twilio signature');
      return reply.code(403).send('Invalid signature');
    }

    const parsed = inboundSchema.safeParse(params);
    if (!parsed.success) {
      return reply.code(400).send('Bad request');
    }

    const result = await processInbound(
      { collections, orgName: deps.orgName },
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

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(result.reply);
    return reply.header('Content-Type', 'text/xml').send(twiml.toString());
  });
}
