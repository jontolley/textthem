import { ObjectId, type Document } from 'mongodb';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type {
  GroupResponse,
  ListGroupsResponse,
  ListGroupMembersResponse,
  GroupMember,
  MemberSortKey,
  MemberStatusResponse,
  TransferMembersResponse,
} from '@text-them/shared';
import { badRequest, conflict, isDuplicateKeyError, notFound } from '../errors.js';
import { escapeRegex } from '../regex.js';
import { serializeGroup } from '../serializers.js';
import { transferMembers } from '../services/transfers.js';
import { setPaused } from '../services/pausing.js';
import type { UserDirectory } from '../services/users.js';
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

const objectIdSchema = z.string().refine((v) => ObjectId.isValid(v), 'Invalid id');

const transferMembersSchema = z
  .object({
    targetGroupId: objectIdSchema,
    mode: z.enum(['copy', 'move']),
    memberIds: z.array(objectIdSchema).min(1).max(5000).optional(),
    all: z.literal(true).optional(),
  })
  .refine((v) => Boolean(v.memberIds) !== Boolean(v.all), {
    message: 'Give either memberIds or all: true',
    path: ['memberIds'],
  });

const memberStatusSchema = z
  .object({
    memberIds: z.array(objectIdSchema).min(1).max(5000).optional(),
    all: z.literal(true).optional(),
  })
  .refine((v) => Boolean(v.memberIds) !== Boolean(v.all), {
    message: 'Give either memberIds or all: true',
    path: ['memberIds'],
  });

const listMembersSchema = z.object({
  list: z.enum(['members', 'left']).default('members'),
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

type MemberCounts = { subscribed: number; paused: number };
const NO_MEMBERS: MemberCounts = { subscribed: 0, paused: 0 };

/** Returns a map of groupId -> counts of subscribed and paused members. */
async function memberCounts(
  fastify: FastifyInstance,
  groupIds: ObjectId[],
): Promise<Map<string, MemberCounts>> {
  if (groupIds.length === 0) return new Map();
  const rows = await fastify.mongo.collections.subscriptions
    .aggregate<{
      _id: { groupId: ObjectId; status: 'subscribed' | 'paused' };
      count: number;
    }>([
      { $match: { groupId: { $in: groupIds }, status: { $in: ['subscribed', 'paused'] } } },
      { $group: { _id: { groupId: '$groupId', status: '$status' }, count: { $sum: 1 } } },
    ])
    .toArray();
  const counts = new Map<string, MemberCounts>();
  for (const r of rows) {
    const key = r._id.groupId.toHexString();
    const c = counts.get(key) ?? { ...NO_MEMBERS };
    c[r._id.status] = r.count;
    counts.set(key, c);
  }
  return counts;
}

/** Which subscriptions each member list shows. Moved-out members (an `admin` unsubscribe) are in neither. */
function listFilter(groupId: ObjectId, list: 'members' | 'left'): Document {
  return list === 'members'
    ? { groupId, status: { $in: ['subscribed', 'paused'] } }
    : { groupId, status: 'unsubscribed', source: { $ne: 'admin' } };
}

export interface GroupRoutesOptions {
  /** Looks up the names of organizers who paused members. */
  users: UserDirectory;
}

export async function groupRoutes(
  fastify: FastifyInstance,
  opts: GroupRoutesOptions,
): Promise<void> {
  const { groups, subscriptions, messages } = fastify.mongo.collections;

  // All routes in this plugin require authentication.
  fastify.addHook('preHandler', fastify.requireAuth);

  fastify.get('/api/groups', async (): Promise<ListGroupsResponse> => {
    const docs = await groups.find().sort({ createdAt: -1 }).toArray();
    const counts = await memberCounts(
      fastify,
      docs.map((d) => d._id),
    );
    return {
      groups: docs.map((d) => serializeGroup(d, counts.get(d._id.toHexString()) ?? NO_MEMBERS)),
    };
  });

  fastify.get<{ Params: { id: string } }>(
    '/api/groups/:id',
    async (request): Promise<GroupResponse> => {
      const id = parseObjectId(request.params.id);
      const doc = await groups.findOne({ _id: id });
      if (!doc) throw notFound('Group not found');
      const counts = await memberCounts(fastify, [id]);
      return { group: serializeGroup(doc, counts.get(id.toHexString()) ?? NO_MEMBERS) };
    },
  );

  fastify.post('/api/groups', async (request, reply): Promise<GroupResponse> => {
    const input = createGroupSchema.parse(request.body);
    const now = new Date();
    const doc: GroupDoc = {
      _id: new ObjectId(),
      orgId: fastify.defaultOrgId,
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
    return { group: serializeGroup(doc, NO_MEMBERS) };
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
        const counts = await memberCounts(fastify, [id]);
        return { group: serializeGroup(updated, counts.get(id.toHexString()) ?? NO_MEMBERS) };
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

  // Copies or moves members to another group of the same org (see services/transfers.ts).
  fastify.post<{ Params: { id: string } }>(
    '/api/groups/:id/members/transfer',
    async (request): Promise<TransferMembersResponse> => {
      const sourceGroupId = parseObjectId(request.params.id);
      const input = transferMembersSchema.parse(request.body);
      const result = await transferMembers(fastify.mongo.collections, {
        sourceGroupId,
        targetGroupId: new ObjectId(input.targetGroupId),
        mode: input.mode,
        members: input.all ? 'all' : input.memberIds!.map((id) => new ObjectId(id)),
      });
      if (result.added > 0 || result.removed > 0) fastify.events.notify('groups');
      return result;
    },
  );

  // Pauses subscribed members (they stay listed but get no messages) or resumes paused ones.
  for (const action of ['pause', 'resume'] as const) {
    fastify.post<{ Params: { id: string } }>(
      `/api/groups/:id/members/${action}`,
      async (request): Promise<MemberStatusResponse> => {
        const groupId = parseObjectId(request.params.id);
        const input = memberStatusSchema.parse(request.body);
        if (!(await groups.findOne({ _id: groupId }))) throw notFound('Group not found');
        const changed = await setPaused(fastify.mongo.collections, action === 'pause', {
          groupId,
          members: input.all ? 'all' : input.memberIds!.map((id) => new ObjectId(id)),
          userId: request.userId,
        });
        if (changed.length > 0) fastify.events.notify('groups');
        return { memberIds: changed.map((id) => id.toHexString()) };
      },
    );
  }

  // One page of a group's current members or of the people who left, optionally filtered.
  fastify.get<{ Params: { id: string } }>(
    '/api/groups/:id/members',
    async (request): Promise<ListGroupMembersResponse> => {
      const id = parseObjectId(request.params.id);
      const { list, q, sort, dir, offset, limit } = listMembersSchema.parse(request.query);
      const group = await groups.findOne({ _id: id });
      if (!group) throw notFound('Group not found');

      type Row = SubscriptionDoc & { member: MemberDoc };
      const [result] = await subscriptions
        .aggregate<{ page: Row[]; matched: { n: number }[] }>([
          { $match: listFilter(id, list) },
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
      const total = await subscriptions.countDocuments(listFilter(id, list));
      const pausers = result.page.flatMap((s) => (s.pausedByUserId ? [s.pausedByUserId] : []));
      const names = pausers.length > 0 ? await opts.users(pausers) : new Map<string, string>();

      return {
        members: result.page.map(
          (s): GroupMember => ({
            memberId: s.memberId.toHexString(),
            phoneNumber: s.member.phoneNumber,
            name: s.member.name,
            status: s.status,
            subscribedAt: s.subscribedAt?.toISOString(),
            unsubscribedAt: s.unsubscribedAt?.toISOString(),
            pausedAt: s.pausedAt?.toISOString(),
            pausedByUserId: s.pausedByUserId,
            pausedByName: s.pausedByUserId ? names.get(s.pausedByUserId) : undefined,
          }),
        ),
        total,
        matched: result.matched[0]?.n ?? 0,
      };
    },
  );
}
