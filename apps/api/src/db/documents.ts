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

/**
 * An organization that owns groups. There is one today (created on boot from
 * DEFAULT_ORG_SLUG); members can only be copied or moved within one org.
 */
export interface OrganizationDoc {
  _id: ObjectId;
  /** Unique. Matches the slug of the org's public pages in apps/web/src/config/org.ts. */
  slug: string;
  name: string;
  createdAt: Date;
}

export interface GroupDoc {
  _id: ObjectId;
  orgId: ObjectId;
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
  /**
   * Where the latest change came from: `sms` for a keyword or STOP, `admin` when
   * an organizer added, removed, paused or resumed them. An `admin` unsubscribe
   * (moved out) can be undone by an organizer; an `sms` one (they opted out) cannot.
   */
  source: SubscriptionSource;
  subscribedAt?: Date;
  unsubscribedAt?: Date;
  /** Set while paused: when, and by which organizer (Clerk user id). */
  pausedAt?: Date;
  pausedByUserId?: string;
}

export interface MessageDoc {
  _id: ObjectId;
  groupId: ObjectId;
  /** May be empty when there's an image. */
  body: string;
  /** Public URLs of the attached images, in order (an MMS); see services/media.ts. */
  mediaUrls?: string[];
  /** Broadcasts from before several images were allowed have this instead; read via `mediaUrlsOf`. */
  mediaUrl?: string;
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
  organizations: 'organizations',
  groups: 'groups',
  members: 'members',
  subscriptions: 'subscriptions',
  messages: 'messages',
  deliveries: 'deliveries',
  inboundMessages: 'inbound_messages',
} as const;

/** A broadcast's images, whether it was saved with one image or several. */
export function mediaUrlsOf(doc: Pick<MessageDoc, 'mediaUrls' | 'mediaUrl'>): string[] {
  return doc.mediaUrls ?? (doc.mediaUrl ? [doc.mediaUrl] : []);
}
