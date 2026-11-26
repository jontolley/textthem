import type { AnyBulkWriteOperation, ObjectId } from 'mongodb';
import type { TransferMembersResponse } from '@text-them/shared';
import type { Collections } from '../db/index.js';
import type { SubscriptionDoc } from '../db/documents.js';
import { badRequest, notFound } from '../errors.js';

export interface TransferMembersInput {
  sourceGroupId: ObjectId;
  targetGroupId: ObjectId;
  mode: 'copy' | 'move';
  /** These members, or every current member of the source when `'all'`. */
  members: ObjectId[] | 'all';
  now?: Date;
}

/**
 * Copies or moves members from one group to another of the same organization.
 *
 * - Only current members of the source group are transferred; anyone else in
 *   `members` is ignored.
 * - Anyone who opted out of the target group (texted STOP, source `sms`) is
 *   never added back, and on a move stays in the source group.
 * - Anyone an organizer removed from the target earlier (source `admin`) can
 *   be added back.
 * - Changes made here are recorded with source `admin`; a move marks the
 *   source subscription unsubscribed.
 */
export async function transferMembers(
  collections: Collections,
  input: TransferMembersInput,
): Promise<TransferMembersResponse> {
  const { sourceGroupId, targetGroupId, mode } = input;
  const now = input.now ?? new Date();

  if (sourceGroupId.equals(targetGroupId)) {
    throw badRequest('Pick a different group to copy or move them to');
  }
  const [source, target] = await Promise.all([
    collections.groups.findOne({ _id: sourceGroupId }),
    collections.groups.findOne({ _id: targetGroupId }),
  ]);
  if (!source) throw notFound('Group not found');
  if (!target) throw notFound('Target group not found');
  if (!source.orgId.equals(target.orgId)) {
    throw badRequest('Members can only be copied or moved to a group of the same organization');
  }

  const sourceSubs = await collections.subscriptions
    .find(
      {
        groupId: sourceGroupId,
        status: 'subscribed',
        ...(input.members === 'all' ? {} : { memberId: { $in: input.members } }),
      },
      { projection: { memberId: 1 } },
    )
    .toArray();
  const memberIds = sourceSubs.map((s) => s.memberId);
  const result: TransferMembersResponse = {
    added: 0,
    alreadyInGroup: 0,
    skippedOptedOut: 0,
    removed: 0,
  };
  if (memberIds.length === 0) return result;

  const targetSubs = new Map(
    (
      await collections.subscriptions
        .find({ groupId: targetGroupId, memberId: { $in: memberIds } })
        .toArray()
    ).map((s) => [s.memberId.toHexString(), s]),
  );

  const adds: AnyBulkWriteOperation<SubscriptionDoc>[] = [];
  const toRemove: ObjectId[] = [];
  for (const memberId of memberIds) {
    const existing = targetSubs.get(memberId.toHexString());
    if (existing?.status === 'subscribed') {
      result.alreadyInGroup++;
      toRemove.push(memberId);
    } else if (existing && existing.source !== 'admin') {
      result.skippedOptedOut++;
    } else if (existing) {
      // An organizer removed them before; only re-add if that's still the case.
      adds.push({
        updateOne: {
          filter: { _id: existing._id, status: 'unsubscribed', source: 'admin' },
          update: {
            $set: { status: 'subscribed', source: 'admin', subscribedAt: now },
            $unset: { unsubscribedAt: '' },
          },
        },
      });
      toRemove.push(memberId);
    } else {
      // $setOnInsert: if they joined by text meanwhile, leave that alone.
      adds.push({
        updateOne: {
          filter: { memberId, groupId: targetGroupId },
          update: {
            $setOnInsert: {
              memberId,
              groupId: targetGroupId,
              status: 'subscribed',
              source: 'admin',
              subscribedAt: now,
            },
          },
          upsert: true,
        },
      });
      toRemove.push(memberId);
    }
  }

  if (adds.length > 0) {
    const written = await collections.subscriptions.bulkWrite(adds, { ordered: false });
    result.added = written.upsertedCount + written.modifiedCount;
    // Any that changed under us (joined or opted out meanwhile) count as already there.
    result.alreadyInGroup += adds.length - result.added;
  }

  if (mode === 'move' && toRemove.length > 0) {
    const removed = await collections.subscriptions.updateMany(
      { groupId: sourceGroupId, memberId: { $in: toRemove }, status: 'subscribed' },
      { $set: { status: 'unsubscribed', source: 'admin', unsubscribedAt: now } },
    );
    result.removed = removed.modifiedCount;
  }

  return result;
}
