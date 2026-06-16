import type { ObjectId } from 'mongodb';
import type { SubscriptionSource, SubscriptionStatus, InboundAction } from '@text-them/shared';

/**
 * Internal MongoDB document shapes. These use ObjectId/Date; routes map them to
 * the serialized wire types from @text-them/shared before responding.
 */

export interface GroupDoc {
  _id: ObjectId;
  name: string;
  /** Uppercased, unique. */
  keyword: string;
  description?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberDoc {
  _id: ObjectId;
  /** E.164. Unique. */
  phoneNumber: string;
  createdAt: Date;
}

export interface SubscriptionDoc {
  _id: ObjectId;
  memberId: ObjectId;
  groupId: ObjectId;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  subscribedAt?: Date;
  unsubscribedAt?: Date;
}

export interface MessageDoc {
  _id: ObjectId;
  groupId: ObjectId;
  body: string;
  sentByUserId: string;
  recipientCount: number;
  acceptedCount: number;
  failedCount: number;
  sentAt: Date;
}

export interface InboundMessageDoc {
  _id: ObjectId;
  fromNumber: string;
  body: string;
  matchedKeyword?: string;
  action: InboundAction;
  receivedAt: Date;
}

export const COLLECTIONS = {
  groups: 'groups',
  members: 'members',
  subscriptions: 'subscriptions',
  messages: 'messages',
  inboundMessages: 'inbound_messages',
} as const;
