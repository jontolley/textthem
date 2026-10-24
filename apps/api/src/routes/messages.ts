import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { BroadcastResponse, ListMessagesResponse } from '@text-them/shared';
import { badRequest, conflict, notFound } from '../errors.js';
import { serializeMessage } from '../serializers.js';
import type { MessageDoc } from '../db/documents.js';
import { deliveryStats } from '../services/deliveries.js';
import { sendBroadcast } from '../services/broadcasts.js';
import type { TwilioService } from '../services/twilio.js';

/** Scheduled times must leave the scheduler a moment to pick them up. */
const MIN_LEAD_MS = 60 * 1000;
const MAX_LEAD_MS = 365 * 24 * 60 * 60 * 1000;

const bodySchema = z.string().trim().min(1).max(1600);

const sendAtSchema = z
  .string()
  .datetime({ offset: true })
  .transform((v) => new Date(v))
  .refine((d) => d.getTime() >= Date.now() + MIN_LEAD_MS, {
    message: 'Schedule it at least 1 minute from now',
  })
  .refine((d) => d.getTime() <= Date.now() + MAX_LEAD_MS, {
    message: 'Schedule it within the next year',
  });

const broadcastSchema = z.object({
  body: bodySchema,
  sendAt: sendAtSchema.optional(),
});

const updateScheduledSchema = z
  .object({ body: bodySchema.optional(), sendAt: sendAtSchema.optional() })
  .refine((v) => v.body !== undefined || v.sendAt !== undefined, {
    message: 'Nothing to update',
  });

function parseObjectId(value: string): ObjectId {
  if (!ObjectId.isValid(value)) throw badRequest('Invalid id');
  return new ObjectId(value);
}

export interface MessageRoutesDeps {
  twilio: TwilioService;
  /** Absolute URL of the Twilio status-callback route. */
  statusCallbackUrl: string;
}

export async function messageRoutes(
  fastify: FastifyInstance,
  deps: MessageRoutesDeps,
): Promise<void> {
  const { collections } = fastify.mongo;
  const { groups, messages, deliveries } = collections;

  fastify.addHook('preHandler', fastify.requireAuth);

  async function respond(doc: MessageDoc): Promise<BroadcastResponse> {
    const stats = await deliveryStats(deliveries, [doc]);
    return { message: serializeMessage(doc, stats.get(doc._id.toHexString())) };
  }

  /** Applies `update` only while the broadcast is still scheduled. */
  async function updateScheduled(id: ObjectId, update: Partial<MessageDoc>): Promise<MessageDoc> {
    const updated = await messages.findOneAndUpdate(
      { _id: id, status: 'scheduled' },
      { $set: update },
      { returnDocument: 'after' },
    );
    if (updated) return updated;
    if (await messages.countDocuments({ _id: id })) {
      throw conflict("This broadcast is no longer scheduled, so it can't be changed");
    }
    throw notFound('Broadcast not found');
  }

  fastify.post<{ Params: { id: string } }>(
    '/api/groups/:id/broadcast',
    async (request, reply): Promise<BroadcastResponse> => {
      const groupId = parseObjectId(request.params.id);
      const { body, sendAt } = broadcastSchema.parse(request.body);

      const group = await groups.findOne({ _id: groupId });
      if (!group) throw notFound('Group not found');

      const doc: MessageDoc = {
        _id: new ObjectId(),
        groupId,
        body,
        sentByUserId: request.userId,
        recipientCount: 0,
        acceptedCount: 0,
        failedCount: 0,
        ...(sendAt
          ? { status: 'scheduled' as const, scheduledFor: sendAt }
          : { status: 'sending' as const, sendingStartedAt: new Date() }),
      };
      // Recorded before any text goes out, so a crash mid-send leaves a trace.
      await messages.insertOne(doc);

      const result = sendAt
        ? doc
        : await sendBroadcast(
            { collections, twilio: deps.twilio, statusCallbackUrl: deps.statusCallbackUrl },
            doc,
          );
      reply.code(201);
      return respond(result);
    },
  );

  fastify.patch<{ Params: { id: string } }>(
    '/api/messages/:id',
    async (request): Promise<BroadcastResponse> => {
      const id = parseObjectId(request.params.id);
      const { body, sendAt } = updateScheduledSchema.parse(request.body);
      const updated = await updateScheduled(id, {
        ...(body !== undefined ? { body } : {}),
        ...(sendAt !== undefined ? { scheduledFor: sendAt } : {}),
      });
      return respond(updated);
    },
  );

  fastify.post<{ Params: { id: string } }>(
    '/api/messages/:id/cancel',
    async (request): Promise<BroadcastResponse> => {
      const id = parseObjectId(request.params.id);
      return respond(await updateScheduled(id, { status: 'canceled' }));
    },
  );

  // Upcoming broadcasts first (soonest first), then the latest 200 others.
  fastify.get('/api/messages', async (): Promise<ListMessagesResponse> => {
    const upcoming = await messages.find({ status: 'scheduled' }).sort({ scheduledFor: 1 }).toArray();
    const past = await messages
      .aggregate<MessageDoc>([
        { $match: { status: { $ne: 'scheduled' } } },
        // Unsent broadcasts (canceled, missed, …) sort by when they were due.
        { $addFields: { sortAt: { $ifNull: ['$sentAt', '$sendingStartedAt', '$scheduledFor'] } } },
        { $sort: { sortAt: -1 } },
        { $limit: 200 },
        { $project: { sortAt: 0 } },
      ])
      .toArray();

    const docs = [...upcoming, ...past];
    const stats = await deliveryStats(deliveries, docs);
    return { messages: docs.map((d) => serializeMessage(d, stats.get(d._id.toHexString()))) };
  });
}
