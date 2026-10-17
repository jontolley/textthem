import type { Collection, ObjectId } from 'mongodb';
import type { DeliveryStats } from '@text-them/shared';
import { isDuplicateKeyError } from '../errors.js';
import type { DeliveryDoc, MessageDoc } from '../db/documents.js';
import type { SentMessage } from './twilio.js';

/**
 * Twilio's outbound message statuses, ranked in the order a message moves
 * through them. Callbacks can repeat or arrive out of order, so a status only
 * replaces one that ranks lower (a late "sent" never undoes "delivered").
 */
const STATUS_RANK: Record<string, number> = {
  scheduled: 0,
  accepted: 1,
  queued: 2,
  sending: 3,
  sent: 4,
  delivered: 5,
  undelivered: 5,
  failed: 5,
  canceled: 5,
  read: 6,
};

const DELIVERED = new Set(['delivered', 'read']);
const UNDELIVERED = new Set(['undelivered', 'failed', 'canceled']);

/** Records the sends of a broadcast that Twilio accepted, before their callbacks resolve them. */
export async function recordSends(
  deliveries: Collection<DeliveryDoc>,
  broadcastId: ObjectId,
  sent: SentMessage[],
): Promise<void> {
  if (sent.length === 0) return;
  const now = new Date();
  await deliveries.bulkWrite(
    sent.map((s) => ({
      updateOne: {
        filter: { twilioSid: s.sid },
        // A callback may already have created the doc; keep the status it set.
        update: {
          $set: { broadcastId, to: s.to },
          $setOnInsert: { status: s.status, createdAt: now, updatedAt: now },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

export interface StatusUpdate {
  sid: string;
  status: string;
  errorCode?: string;
}

/**
 * Applies one Twilio status callback. Returns false (and writes nothing) for a
 * status we don't track.
 */
export async function recordStatus(
  deliveries: Collection<DeliveryDoc>,
  { sid, status, errorCode }: StatusUpdate,
): Promise<boolean> {
  const rank = STATUS_RANK[status];
  if (rank === undefined) return false;

  const atOrAbove = Object.keys(STATUS_RANK).filter((s) => STATUS_RANK[s] >= rank);
  const filter = { twilioSid: sid, status: { $nin: atOrAbove } };
  const now = new Date();
  const update = {
    $set: { status, updatedAt: now, ...(errorCode ? { errorCode } : {}) },
    $setOnInsert: { createdAt: now },
  };

  try {
    // Upsert: the callback can beat recordSends to the database.
    await deliveries.updateOne(filter, update, { upsert: true });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    // The doc exists and the filter missed it: it either already holds an
    // equal or later status (leave it), or was created concurrently (update it).
    await deliveries.updateOne(filter, update);
  }
  return true;
}

/**
 * Delivery stats per broadcast id (hex). Broadcasts that had accepted sends
 * but no delivery docs predate tracking and are left out of the map.
 */
export async function deliveryStats(
  deliveries: Collection<DeliveryDoc>,
  broadcasts: MessageDoc[],
): Promise<Map<string, DeliveryStats>> {
  if (broadcasts.length === 0) return new Map();
  const rows = await deliveries
    .aggregate<{
      _id: { broadcastId: ObjectId; status: string; errorCode?: string };
      count: number;
    }>([
      { $match: { broadcastId: { $in: broadcasts.map((b) => b._id) } } },
      {
        $group: {
          _id: { broadcastId: '$broadcastId', status: '$status', errorCode: '$errorCode' },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const stats = new Map<string, DeliveryStats>();
  const errorCounts = new Map<string, Map<string, number>>();
  for (const { _id, count } of rows) {
    const id = _id.broadcastId.toHexString();
    const s = stats.get(id) ?? { delivered: 0, undelivered: 0, pending: 0 };
    stats.set(id, s);
    if (DELIVERED.has(_id.status)) {
      s.delivered += count;
    } else if (UNDELIVERED.has(_id.status)) {
      s.undelivered += count;
      if (_id.errorCode) {
        const codes = errorCounts.get(id) ?? new Map<string, number>();
        codes.set(_id.errorCode, (codes.get(_id.errorCode) ?? 0) + count);
        errorCounts.set(id, codes);
      }
    } else {
      s.pending += count;
    }
  }

  for (const [id, codes] of errorCounts) {
    // Most frequent first; ties go to the lower code so the result is stable.
    const [top] = [...codes].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
    stats.get(id)!.topErrorCode = top[0];
  }

  // Nothing was accepted, so there is nothing to track: report zeros.
  for (const b of broadcasts) {
    const id = b._id.toHexString();
    if (b.acceptedCount === 0 && !stats.has(id)) {
      stats.set(id, { delivered: 0, undelivered: 0, pending: 0 });
    }
  }
  return stats;
}
