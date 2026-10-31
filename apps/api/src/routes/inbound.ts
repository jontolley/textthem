import type { FastifyInstance } from 'fastify';
import type { ListInboundMessagesResponse } from '@text-them/shared';
import { serializeInboundMessage } from '../serializers.js';

const LIST_LIMIT = 200;

/** Texts people sent to the org's number, for the dashboard's Replies page. */
export async function inboundRoutes(fastify: FastifyInstance): Promise<void> {
  const { inboundMessages, members, subscriptions } = fastify.mongo.collections;

  fastify.addHook('preHandler', fastify.requireAuth);

  // The latest texts, each with its sender's name and the groups they're in now.
  fastify.get('/api/inbound-messages', async (): Promise<ListInboundMessagesResponse> => {
    const docs = await inboundMessages
      .find()
      .sort({ receivedAt: -1, _id: -1 }) // _id breaks ties within a millisecond
      .limit(LIST_LIMIT)
      .toArray();

    const senders = await members
      .find({ phoneNumber: { $in: [...new Set(docs.map((d) => d.fromNumber))] } })
      .toArray();
    const subs = await subscriptions
      .find({ memberId: { $in: senders.map((m) => m._id) }, status: 'subscribed' })
      .toArray();
    const groupIdsByMember = new Map<string, string[]>();
    for (const s of subs) {
      const key = s.memberId.toHexString();
      groupIdsByMember.set(key, [...(groupIdsByMember.get(key) ?? []), s.groupId.toHexString()]);
    }
    const senderByPhone = new Map(senders.map((m) => [m.phoneNumber, m]));

    return {
      messages: docs.map((d) => {
        const sender = senderByPhone.get(d.fromNumber);
        return serializeInboundMessage(
          d,
          (sender && groupIdsByMember.get(sender._id.toHexString())) ?? [],
          sender?.name,
        );
      }),
    };
  });
}
