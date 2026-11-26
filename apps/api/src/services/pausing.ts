import type { ObjectId } from 'mongodb';
import type { Collections } from '../db/index.js';

export interface SetPausedInput {
  groupId: ObjectId;
  /** These members, or every member of the group when `'all'`. */
  members: ObjectId[] | 'all';
  /** The organizer doing it (Clerk user id); recorded on a pause. */
  userId: string;
  now?: Date;
}

/**
 * Pauses subscribed members of a group (`paused: true`) or resumes paused ones.
 * A paused member stays listed but gets no messages; only an organizer, or the
 * member texting the keyword again, ends a pause. Members in any other state
 * are left alone. Returns the ids whose status changed.
 */
export async function setPaused(
  collections: Collections,
  paused: boolean,
  input: SetPausedInput,
): Promise<ObjectId[]> {
  const now = input.now ?? new Date();
  const filter = {
    groupId: input.groupId,
    status: paused ? ('subscribed' as const) : ('paused' as const),
    ...(input.members === 'all' ? {} : { memberId: { $in: input.members } }),
  };
  const ids = (
    await collections.subscriptions.find(filter, { projection: { memberId: 1 } }).toArray()
  ).map((s) => s.memberId);
  if (ids.length === 0) return [];

  // Re-checks the status, so a member who texted STOP meanwhile isn't brought back.
  await collections.subscriptions.updateMany(
    { ...filter, memberId: { $in: ids } },
    paused
      ? {
          $set: { status: 'paused', source: 'admin', pausedAt: now, pausedByUserId: input.userId },
        }
      : {
          $set: { status: 'subscribed', source: 'admin' },
          $unset: { pausedAt: '', pausedByUserId: '' },
        },
  );
  return ids;
}
