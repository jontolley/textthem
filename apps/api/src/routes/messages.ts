import { ObjectId, type Document, type Filter } from 'mongodb';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  MAX_BROADCAST_IMAGES,
  type BroadcastResponse,
  type ListMessagesResponse,
  type ListSendersResponse,
} from '@text-them/shared';
import { badRequest, conflict, notFound } from '../errors.js';
import { escapeRegex } from '../regex.js';
import { serializeMessage } from '../serializers.js';
import { COLLECTIONS, type MessageDoc } from '../db/documents.js';
import { deliveryStats } from '../services/deliveries.js';
import { sendBroadcast } from '../services/broadcasts.js';
import type { MediaStore } from '../services/media.js';
import type { TwilioService } from '../services/twilio.js';
import type { UserDirectory } from '../services/users.js';

/** Scheduled times must leave the scheduler a moment to pick them up. */
const MIN_LEAD_MS = 60 * 1000;
const MAX_LEAD_MS = 365 * 24 * 60 * 60 * 1000;

/** May be empty: a broadcast needs text, an image, or both (checked once both are known). */
const bodySchema = z.string().trim().max(1600);
const mediaUrlsSchema = z
  .array(z.string().url().max(500))
  .max(MAX_BROADCAST_IMAGES, `Attach at most ${MAX_BROADCAST_IMAGES} images`);
const NEEDS_CONTENT = 'Write a message or attach an image';

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

const broadcastSchema = z
  .object({
    body: bodySchema.default(''),
    mediaUrls: mediaUrlsSchema.default([]),
    sendAt: sendAtSchema.optional(),
  })
  .refine((v) => v.body || v.mediaUrls.length, { message: NEEDS_CONTENT, path: ['body'] });

const isoTime = z
  .string()
  .datetime({ offset: true })
  .transform((v) => new Date(v));

const listMessagesSchema = z.object({
  list: z.enum(['scheduled', 'history']).default('history'),
  sort: z.enum(['when', 'group']).default('when'),
  dir: z.enum(['asc', 'desc']).optional(),
  groupId: z
    .string()
    .refine((v) => ObjectId.isValid(v), 'Invalid group id')
    .transform((v) => new ObjectId(v))
    .optional(),
  sentBy: z.string().min(1).max(100).optional(),
  q: z.string().trim().max(200).default(''),
  from: isoTime.optional(),
  to: isoTime.optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(15),
});

const updateScheduledSchema = z
  .object({
    body: bodySchema.optional(),
    /** Replaces the images; empty removes them all. */
    mediaUrls: mediaUrlsSchema.optional(),
    sendAt: sendAtSchema.optional(),
  })
  .refine((v) => v.body !== undefined || v.mediaUrls !== undefined || v.sendAt !== undefined, {
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
  /** Names each broadcast's sender. */
  users: UserDirectory;
  /** Where images are kept; without one, broadcasts can't have them. */
  media?: MediaStore;
}

export async function messageRoutes(
  fastify: FastifyInstance,
  deps: MessageRoutesDeps,
): Promise<void> {
  const { collections } = fastify.mongo;
  const { groups, messages, deliveries } = collections;

  fastify.addHook('preHandler', fastify.requireAuth);

  /** Serializes broadcasts with their delivery stats and senders' names. */
  async function serialize(docs: MessageDoc[]) {
    const [stats, names] = await Promise.all([
      deliveryStats(deliveries, docs),
      deps.users(docs.map((d) => d.sentByUserId)),
    ]);
    return docs.map((d) =>
      serializeMessage(d, stats.get(d._id.toHexString()), names.get(d.sentByUserId)),
    );
  }

  async function respond(doc: MessageDoc): Promise<BroadcastResponse> {
    const [message] = await serialize([doc]);
    return { message };
  }

  /** Only images this server stored: Twilio fetches the URL, so it mustn't point anywhere else. */
  function checkMediaUrls(urls: string[] = []): void {
    if (!urls.length) return;
    if (!deps.media) throw badRequest("Images aren't set up on this server");
    if (!urls.every((url) => deps.media!.owns(url))) throw badRequest('Upload the images first');
  }

  /** Applies `update` only while the broadcast is still scheduled. */
  async function updateScheduled(
    id: ObjectId,
    update: Partial<MessageDoc>,
    unset: (keyof MessageDoc)[] = [],
    extraFilter: Filter<MessageDoc> = {},
  ): Promise<MessageDoc> {
    const updated = await messages.findOneAndUpdate(
      { _id: id, status: 'scheduled', ...extraFilter },
      {
        $set: update,
        ...(unset.length ? { $unset: Object.fromEntries(unset.map((k) => [k, ''])) } : {}),
      },
      { returnDocument: 'after' },
    );
    if (updated) {
      fastify.events.notify('messages');
      return updated;
    }
    if (await messages.countDocuments({ _id: id })) {
      throw conflict("This message is no longer scheduled, so it can't be changed");
    }
    throw notFound('Message not found');
  }

  fastify.post<{ Params: { id: string } }>(
    '/api/groups/:id/broadcast',
    async (request, reply): Promise<BroadcastResponse> => {
      const groupId = parseObjectId(request.params.id);
      const { body, mediaUrls, sendAt } = broadcastSchema.parse(request.body);
      checkMediaUrls(mediaUrls);

      const group = await groups.findOne({ _id: groupId });
      if (!group) throw notFound('Group not found');

      const doc: MessageDoc = {
        _id: new ObjectId(),
        groupId,
        body,
        ...(mediaUrls.length ? { mediaUrls } : {}),
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
      fastify.events.notify('messages');

      const result = sendAt
        ? doc
        : await sendBroadcast(
            { collections, twilio: deps.twilio, statusCallbackUrl: deps.statusCallbackUrl },
            doc,
          );
      if (!sendAt) fastify.events.notify('messages');
      reply.code(201);
      return respond(result);
    },
  );

  fastify.patch<{ Params: { id: string } }>(
    '/api/messages/:id',
    async (request): Promise<BroadcastResponse> => {
      const id = parseObjectId(request.params.id);
      const { body, mediaUrls, sendAt } = updateScheduledSchema.parse(request.body);
      checkMediaUrls(mediaUrls);
      // An edit can't leave it with neither text nor an image. When it clears one and
      // keeps the other, the kept one is checked in the same atomic update.
      const clearsBody = body === '';
      const clearsMedia = mediaUrls?.length === 0;
      if (clearsBody && clearsMedia) {
        throw badRequest(NEEDS_CONTENT);
      }
      const keepsContent: Filter<MessageDoc> =
        clearsBody && mediaUrls === undefined
          ? // Older broadcasts keep a single image in `mediaUrl`.
            { $or: [{ 'mediaUrls.0': { $exists: true } }, { mediaUrl: { $exists: true } }] }
          : clearsMedia && body === undefined
            ? { body: { $nin: [''] } }
            : {};
      try {
        const updated = await updateScheduled(
          id,
          {
            ...(body !== undefined ? { body } : {}),
            ...(mediaUrls?.length ? { mediaUrls } : {}),
            ...(sendAt !== undefined ? { scheduledFor: sendAt } : {}),
          },
          // New images replace an older broadcast's single one too.
          mediaUrls === undefined ? [] : clearsMedia ? ['mediaUrls', 'mediaUrl'] : ['mediaUrl'],
          keepsContent,
        );
        return respond(updated);
      } catch (err) {
        // Still scheduled, so it was the content check that didn't match.
        if (
          Object.keys(keepsContent).length &&
          (await messages.countDocuments({ _id: id, status: 'scheduled' }))
        ) {
          throw badRequest(NEEDS_CONTENT);
        }
        throw err;
      }
    },
  );

  fastify.post<{ Params: { id: string } }>(
    '/api/messages/:id/cancel',
    async (request): Promise<BroadcastResponse> => {
      const id = parseObjectId(request.params.id);
      return respond(await updateScheduled(id, { status: 'canceled' }));
    },
  );

  // One page of the scheduled broadcasts (soonest first) or of the rest (most recent first).
  // One page of the scheduled broadcasts or of the rest, sorted and filtered.
  fastify.get('/api/messages', async (request): Promise<ListMessagesResponse> => {
    const query = listMessagesSchema.parse(request.query);
    const { list, sort, groupId, sentBy, q, from, to, offset, limit } = query;
    const inList: Filter<MessageDoc> = {
      status: list === 'scheduled' ? 'scheduled' : { $ne: 'scheduled' },
    };
    const filters: Document = {
      ...(groupId ? { groupId } : {}),
      ...(sentBy ? { sentByUserId: sentBy } : {}),
      ...(q ? { body: { $regex: escapeRegex(q), $options: 'i' } } : {}),
      ...(from || to
        ? { sortAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) } }
        : {}),
    };
    // Scheduled ones read soonest first, the rest most recent first, unless asked otherwise.
    const dir = (query.dir ?? (list === 'scheduled' ? 'asc' : 'desc')) === 'asc' ? 1 : -1;
    // Ties (and the rows within a group) keep the list's natural order.
    const natural = list === 'scheduled' ? 1 : -1;
    const order: Record<string, 1 | -1> =
      sort === 'group'
        ? { groupName: dir, sortAt: natural, _id: natural }
        : { sortAt: dir, _id: dir };

    const [result] = await messages
      .aggregate<{ page: MessageDoc[]; matched: { n: number }[] }>([
        { $match: inList },
        // Unsent broadcasts (canceled, missed, …) sort and filter by when they were due.
        { $addFields: { sortAt: { $ifNull: ['$sentAt', '$sendingStartedAt', '$scheduledFor'] } } },
        { $match: filters },
        ...(sort === 'group'
          ? [
              {
                $lookup: {
                  from: COLLECTIONS.groups,
                  localField: 'groupId',
                  foreignField: '_id',
                  as: 'group',
                },
              },
              { $addFields: { groupName: { $toLower: { $first: '$group.name' } } } },
            ]
          : []),
        { $sort: order },
        {
          $facet: {
            page: [
              { $skip: offset },
              { $limit: limit },
              { $project: { sortAt: 0, group: 0, groupName: 0 } },
            ],
            matched: [{ $count: 'n' }],
          },
        },
      ])
      .toArray();
    const total = await messages.countDocuments(inList);

    return {
      messages: await serialize(result.page),
      total,
      matched: result.matched[0]?.n ?? 0,
    };
  });

  // Who to offer in the dashboard's "Sent by" filter.
  fastify.get('/api/messages/senders', async (): Promise<ListSendersResponse> => {
    const ids: string[] = await messages.distinct('sentByUserId');
    const names = await deps.users(ids);
    const senders = ids.map((userId) => ({ userId, name: names.get(userId) }));
    // Named people alphabetically, then any whose name couldn't be found.
    senders.sort((a, b) =>
      a.name && b.name ? a.name.localeCompare(b.name) : a.name ? -1 : b.name ? 1 : 0,
    );
    return { senders };
  });
}
