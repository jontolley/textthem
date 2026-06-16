import type { Group, BroadcastMessage } from '@text-them/shared';
import type { GroupDoc, MessageDoc } from './db/documents.js';

export function serializeGroup(doc: GroupDoc, memberCount?: number): Group {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    keyword: doc.keyword,
    description: doc.description,
    active: doc.active,
    memberCount,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function serializeMessage(doc: MessageDoc): BroadcastMessage {
  return {
    id: doc._id.toHexString(),
    groupId: doc.groupId.toHexString(),
    body: doc.body,
    sentByUserId: doc.sentByUserId,
    recipientCount: doc.recipientCount,
    acceptedCount: doc.acceptedCount,
    failedCount: doc.failedCount,
    sentAt: doc.sentAt.toISOString(),
  };
}
