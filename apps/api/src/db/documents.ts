import type { ObjectId } from 'mongodb';
import type {
  BroadcastStatus,
  InboundAction,
  SubscriptionSource,
  SubscriptionStatus,
} from '@text-them/shared';

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
  /** Set by an organizer from the dashboard. Absent when unnamed. */
  name?: string;
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
  /** Absent on broadcasts from before scheduling existed, which were all sent. */
  status?: BroadcastStatus;
  /** Requested send time (scheduled broadcasts only). */
  scheduledFor?: Date;
  /** When sending began; a send stuck past a cutoff is marked interrupted. */
  sendingStartedAt?: Date;
  /** 0 until sent: recipients are the group's subscribers at send time. */
  recipientCount: number;
  acceptedCount: number;
  failedCount: number;
  /** Set once sent. */
  sentAt?: Date;
}

/**
 * One outbound text of a broadcast, keyed by its Twilio Message SID. Twilio's
 * status callbacks update `status` until it reaches a final state.
 */
export interface DeliveryDoc {
  _id: ObjectId;
  /** Twilio Message SID (SM…). Unique. */
  twilioSid: string;
  /**
   * The broadcast (`messages` doc) this send belongs to. Set when the send is
   * recorded; a status callback can arrive first and create the doc without it.
   */
  broadcastId?: ObjectId;
  /** Recipient, E.164. Set alongside `broadcastId`. */
  to?: string;
  /** Latest Twilio message status, e.g. "queued", "delivered", "undelivered". */
  status: string;
  /** Twilio error code reported with a failed/undelivered status, e.g. "30034". */
  errorCode?: string;
  createdAt: Date;
  updatedAt: Date;
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
  deliveries: 'deliveries',
  inboundMessages: 'inbound_messages',
} as const;
