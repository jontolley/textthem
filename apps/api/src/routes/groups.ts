import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type {
  GroupResponse,
  ListGroupsResponse,
  ListGroupMembersResponse,
  GroupMember,
} from '@text-them/shared';
import { badRequest, conflict, isDuplicateKeyError, notFound } from '../errors.js';
import { serializeGroup } from '../serializers.js';
import type { GroupDoc } from '../db/documents.js';

const keywordSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[A-Za-z0-9]+$/, 'Keyword must be alphanumeric (no spaces or symbols)')
  .transform((v) => v.toUpperCase());

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  keyword: keywordSchema,
  description: z.string().trim().max(500).optional(),
  active: z.boolean().default(true),
});

const updateGroupSchema = createGroupSchema.partial();

function parseObjectId(value: string): ObjectId {
  if (!ObjectId.isValid(value)) throw badRequest('Invalid id');
  return new ObjectId(value);
}

/** Returns a map of groupId -> count of currently subscribed members. */
async function subscribedCounts(
  fastify: FastifyInstance,
  groupIds: ObjectId[],
): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();
  const rows = await fastify.mongo.collections.subscriptions
    .aggregate<{ _id: ObjectId; count: number }>([
      { $match: { groupId: { $in: groupIds }, status: 'subscribed' } },
      { $group: { _id: '$groupId', count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id.toHexString(), r.count]));
}

export async function groupRoutes(fastify: FastifyInstance): Promise<void> {
  const { groups, subscriptions, members, messages } = fastify.mongo.collections;

  // All routes in this plugin require authentication.
  fastify.addHook('preHandler', fastify.requireAuth);

  fastify.get('/api/groups', async (): Promise<ListGroupsResponse> => {
    const docs = await groups.find().sort({ createdAt: -1 }).toArray();
    const counts = await subscribedCounts(
      fastify,
      docs.map((d) => d._id),
    );
    return { groups: docs.map((d) => serializeGroup(d, counts.get(d._id.toHexString()) ?? 0)) };
  });

  fastify.get<{ Params: { id: string } }>(
    '/api/groups/:id',
    async (request): Promise<GroupResponse> => {
      const id = parseObjectId(request.params.id);
      const doc = await groups.findOne({ _id: id });
      if (!doc) throw notFound('Group not found');
      const counts = await subscribedCounts(fastify, [id]);
      return { group: serializeGroup(doc, counts.get(id.toHexString()) ?? 0) };
    },
  );

  fastify.post('/api/groups', async (request, reply): Promise<GroupResponse> => {
    const input = createGroupSchema.parse(request.body);
    const now = new Date();
    const doc: GroupDoc = {
      _id: new ObjectId(),
      name: input.name,
      keyword: input.keyword,
      description: input.description,
      active: input.active,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await groups.insertOne(doc);
    } catch (err) {
      if (isDuplicateKeyError(err)) throw conflict(`Keyword "${input.keyword}" is already in use`);
      throw err;
    }
    fastify.events.notify('groups');
    reply.code(201);
    return { group: serializeGroup(doc, 0) };
  });

  fastify.patch<{ Params: { id: string } }>(
    '/api/groups/:id',
    async (request): Promise<GroupResponse> => {
      const id = parseObjectId(request.params.id);
      const input = updateGroupSchema.parse(request.body);
      if (Object.keys(input).length === 0) throw badRequest('No fields to update');

      try {
        const updated = await groups.findOneAndUpdate(
          { _id: id },
          { $set: { ...input, updatedAt: new Date() } },
          { returnDocument: 'after' },
        );
        if (!updated) throw notFound('Group not found');
        fastify.events.notify('groups');
        const counts = await subscribedCounts(fastify, [id]);
        return { group: serializeGroup(updated, counts.get(id.toHexString()) ?? 0) };
      } catch (err) {
        if (isDuplicateKeyError(err)) throw conflict(`Keyword "${input.keyword}" is already in use`);
        throw err;
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const id = parseObjectId(request.params.id);
    const result = await groups.deleteOne({ _id: id });
    if (result.deletedCount === 0) throw notFound('Group not found');
    await subscriptions.deleteMany({ groupId: id });
    // Nothing left to send them to.
    await messages.updateMany({ groupId: id, status: 'scheduled' }, { $set: { status: 'canceled' } });
    fastify.events.notify('groups');
    fastify.events.notify('messages');
    reply.code(204);
  });

  fastify.get<{ Params: { id: string } }>(
    '/api/groups/:id/members',
    async (request): Promise<ListGroupMembersResponse> => {
      const id = parseObjectId(request.params.id);
      const group = await groups.findOne({ _id: id });
      if (!group) throw notFound('Group not found');

      const subs = await subscriptions.find({ groupId: id }).toArray();
      const memberDocs = await members
        .find({ _id: { $in: subs.map((s) => s.memberId) } })
        .toArray();
      const memberById = new Map(memberDocs.map((m) => [m._id.toHexString(), m]));

      const toMember = (s: (typeof subs)[number]): GroupMember => ({
        memberId: s.memberId.toHexString(),
        phoneNumber: memberById.get(s.memberId.toHexString())?.phoneNumber ?? '',
        name: memberById.get(s.memberId.toHexString())?.name,
        status: s.status,
        subscribedAt: s.subscribedAt?.toISOString(),
        unsubscribedAt: s.unsubscribedAt?.toISOString(),
      });
      const left = subs
        .filter((s) => s.status === 'unsubscribed')
        .sort((a, b) => (b.unsubscribedAt?.getTime() ?? 0) - (a.unsubscribedAt?.getTime() ?? 0));
      return {
        members: subs.filter((s) => s.status === 'subscribed').map(toMember),
        unsubscribed: left.map(toMember),
      };
    },
  );
}
