import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { BroadcastResponse, ListMessagesResponse } from '@text-them/shared';
import { badRequest, notFound } from '../errors.js';
import { serializeMessage } from '../serializers.js';
import type { MessageDoc } from '../db/documents.js';
import type { TwilioService } from '../services/twilio.js';

const broadcastSchema = z.object({
  body: z.string().trim().min(1).max(1600),
});

export interface MessageRoutesDeps {
  twilio: TwilioService;
}

export async function messageRoutes(
  fastify: FastifyInstance,
  deps: MessageRoutesDeps,
): Promise<void> {
  const { groups, subscriptions, members, messages } = fastify.mongo.collections;

  fastify.addHook('preHandler', fastify.requireAuth);

  fastify.post<{ Params: { id: string } }>(
    '/api/groups/:id/broadcast',
    async (request, reply): Promise<BroadcastResponse> => {
      if (!ObjectId.isValid(request.params.id)) throw badRequest('Invalid id');
      const groupId = new ObjectId(request.params.id);
      const { body } = broadcastSchema.parse(request.body);

      const group = await groups.findOne({ _id: groupId });
      if (!group) throw notFound('Group not found');

      const subs = await subscriptions.find({ groupId, status: 'subscribed' }).toArray();
      const memberDocs = await members
        .find({ _id: { $in: subs.map((s) => s.memberId) } })
        .toArray();
      const recipients = memberDocs.map((m) => m.phoneNumber);

      const { accepted, failed } =
        recipients.length > 0
          ? await deps.twilio.sendBulk(recipients, body)
          : { accepted: 0, failed: 0 };

      const doc: MessageDoc = {
        _id: new ObjectId(),
        groupId,
        body,
        sentByUserId: request.userId,
        recipientCount: recipients.length,
        acceptedCount: accepted,
        failedCount: failed,
        sentAt: new Date(),
      };
      await messages.insertOne(doc);

      reply.code(201);
      return { message: serializeMessage(doc) };
    },
  );

  fastify.get('/api/messages', async (): Promise<ListMessagesResponse> => {
    const docs = await messages.find().sort({ sentAt: -1 }).limit(200).toArray();
    return { messages: docs.map(serializeMessage) };
  });
}
