import { ObjectId, type Document } from 'mongodb';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type {
  GroupResponse,
  ListGroupsResponse,
  ListGroupMembersResponse,
  GroupMember,
  MemberSortKey,
} from '@text-them/shared';
import { badRequest, conflict, isDuplicateKeyError, notFound } from '../errors.js';
import { escapeRegex } from '../regex.js';
import { serializeGroup } from '../serializers.js';
import {
  COLLECTIONS,
  type GroupDoc,
  type MemberDoc,
  type SubscriptionDoc,
} from '../db/documents.js';

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

const listMembersSchema = z.object({
  status: z.enum(['subscribed', 'unsubscribed']).default('subscribed'),
  q: z.string().trim().max(100).default(''),
  sort: z.enum(['name', 'phone', 'subscribed', 'left']).default('name'),
  dir: z.enum(['asc', 'desc']).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(15),
});

/**
 * The `$sort` for a member list. Names and phone numbers default to A to Z,
 * dates to most recent first. Unnamed members always come after named ones,
 * and ties fall back to the phone number (unique per member).
 */
function memberSort(sort: MemberSortKey, dirParam: 'asc' | 'desc' | undefined): Document {
  const dir =
    (dirParam ?? (sort === 'name' || sort === 'phone' ? 'asc' : 'desc')) === 'asc' ? 1 : -1;
  switch (sort) {
    case 'name':
      return { noName: 1, nameKey: dir, 'member.phoneNumber': 1 };
    case 'phone':
      return { 'member.phoneNumber': dir };
    case 'subscribed':
      return { subscribedAt: dir, 'member.phoneNumber': 1 };
    case 'left':
      return { unsubscribedAt: dir, 'member.phoneNumber': 1 };
  }
}

/**
 * Matches a member by name (case-insensitive) or by phone number. The number
 * is compared as digits, so "(509) 209-7297", "509-209" and "+1509" all work.
 */
function memberFilter(q: string): Document {
  const name = { 'member.name': { $regex: escapeRegex(q), $options: 'i' } };
  const digits = q.replace(/\D/g, '');
  return digits ? { $or: [name, { 'member.phoneNumber': { $regex: digits } }] } : name;
}

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
    .aggregate<{
      _id: ObjectId;
      count: number;
    }>([
      { $match: { groupId: { $in: groupIds }, status: 'subscribed' } },
      { $group: { _id: '$groupId', count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id.toHexString(), r.count]));
}

export async function groupRoutes(fastify: FastifyInstance): Promise<void> {
  const { groups, subscriptions, messages } = fastify.mongo.collections;

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
        if (isDuplicateKeyError(err))
          throw conflict(`Keyword "${input.keyword}" is already in use`);
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
    await messages.updateMany(
      { groupId: id, status: 'scheduled' },
      { $set: { status: 'canceled' } },
    );
    fastify.events.notify('groups');
    fastify.events.notify('messages');
    reply.code(204);
  });

  // One page of a group's current members or of the people who left, optionally filtered.
  fastify.get<{ Params: { id: string } }>(
    '/api/groups/:id/members',
    async (request): Promise<ListGroupMembersResponse> => {
      const id = parseObjectId(request.params.id);
      const { status, q, sort, dir, offset, limit } = listMembersSchema.parse(request.query);
      const group = await groups.findOne({ _id: id });
      if (!group) throw notFound('Group not found');

      type Row = SubscriptionDoc & { member: MemberDoc };
      const [result] = await subscriptions
        .aggregate<{ page: Row[]; matched: { n: number }[] }>([
          { $match: { groupId: id, status } },
          {
            $lookup: {
              from: COLLECTIONS.members,
              localField: 'memberId',
              foreignField: '_id',
              as: 'member',
            },
          },
          { $unwind: '$member' },
          ...(q ? [{ $match: memberFilter(q) }] : []),
          ...(sort === 'name'
            ? [
                {
                  $addFields: {
                    noName: { $cond: [{ $gt: [{ $ifNull: ['$member.name', ''] }, ''] }, 0, 1] },
                    nameKey: { $toLower: { $ifNull: ['$member.name', ''] } },
                  },
                },
              ]
            : []),
          { $sort: memberSort(sort, dir) },
          { $project: { noName: 0, nameKey: 0 } },
          {
            $facet: {
              page: [{ $skip: offset }, { $limit: limit }],
              matched: [{ $count: 'n' }],
            },
          },
        ])
        .toArray();
      const total = await subscriptions.countDocuments({ groupId: id, status });

      return {
        members: result.page.map(
          (s): GroupMember => ({
            memberId: s.memberId.toHexString(),
            phoneNumber: s.member.phoneNumber,
            name: s.member.name,
            status: s.status,
            subscribedAt: s.subscribedAt?.toISOString(),
            unsubscribedAt: s.unsubscribedAt?.toISOString(),
          }),
        ),
        total,
        matched: result.matched[0]?.n ?? 0,
      };
    },
  );
}
