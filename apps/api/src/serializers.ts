import type {
  Group,
  BroadcastMessage,
  DeliveryStats,
  InboundMessage,
  Member,
} from '@text-them/shared';
import type { GroupDoc, InboundMessageDoc, MemberDoc, MessageDoc } from './db/documents.js';

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

export function serializeMember(doc: MemberDoc): Member {
  return {
    id: doc._id.toHexString(),
    phoneNumber: doc.phoneNumber,
    name: doc.name,
    createdAt: doc.createdAt.toISOString(),
  };
}

export function serializeMessage(doc: MessageDoc, delivery?: DeliveryStats): BroadcastMessage {
  return {
    id: doc._id.toHexString(),
    groupId: doc.groupId.toHexString(),
    body: doc.body,
    sentByUserId: doc.sentByUserId,
    status: doc.status ?? 'sent',
    scheduledFor: doc.scheduledFor?.toISOString(),
    recipientCount: doc.recipientCount,
    acceptedCount: doc.acceptedCount,
    failedCount: doc.failedCount,
    delivery,
    sentAt: doc.sentAt?.toISOString(),
  };
}

export function serializeInboundMessage(
  doc: InboundMessageDoc,
  groupIds: string[],
): InboundMessage {
  return {
    id: doc._id.toHexString(),
    fromNumber: doc.fromNumber,
    body: doc.body,
    action: doc.action,
    matchedKeyword: doc.matchedKeyword,
    groupIds,
    receivedAt: doc.receivedAt.toISOString(),
  };
}
