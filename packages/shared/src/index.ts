/**
 * Shared domain & API types used by both the backend (apps/api) and the
 * frontend (apps/web). All identifiers and dates are represented in their
 * serialized "wire" form: ids are strings (Mongo ObjectId hex), dates are
 * ISO-8601 strings. The backend converts to/from ObjectId/Date at its edges.
 */

export type SubscriptionStatus = 'subscribed' | 'unsubscribed';

/** How a subscription change originated. */
export type SubscriptionSource = 'sms' | 'admin' | 'import';

/** The action taken in response to an inbound SMS. */
export type InboundAction = 'join' | 'stop' | 'help' | 'unknown';

export interface Group {
  id: string;
  name: string;
  /** Uppercased, unique opt-in keyword (e.g. "DRAGON"). */
  keyword: string;
  description?: string;
  active: boolean;
  /** Count of currently-subscribed members (populated on list/detail reads). */
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  /** E.164 formatted phone number, e.g. "+15551234567". */
  phoneNumber: string;
  createdAt: string;
}

export interface Subscription {
  id: string;
  memberId: string;
  groupId: string;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  subscribedAt?: string;
  unsubscribedAt?: string;
}

/** A subscribed member as returned by the group members endpoint. */
export interface GroupMember {
  memberId: string;
  phoneNumber: string;
  status: SubscriptionStatus;
  subscribedAt?: string;
}

/**
 * What Twilio's status callbacks have reported for a broadcast's accepted
 * sends. Acceptance only means Twilio queued a text; carriers can still drop it
 * (e.g. error 30034 for unregistered A2P 10DLC traffic).
 */
export interface DeliveryStats {
  /** Confirmed delivered to the handset. */
  delivered: number;
  /** Ended undelivered or failed after Twilio accepted them. */
  undelivered: number;
  /** Accepted but no final status reported yet. */
  pending: number;
  /** Most common Twilio error code among undelivered sends (e.g. "30034"). */
  topErrorCode?: string;
}

export interface BroadcastMessage {
  id: string;
  groupId: string;
  body: string;
  sentByUserId: string;
  recipientCount: number;
  /** Number of sends Twilio accepted (queued). Not proof of delivery. */
  acceptedCount: number;
  /** Number of sends Twilio's API rejected outright. */
  failedCount: number;
  /** Absent for broadcasts sent before delivery tracking existed. */
  delivery?: DeliveryStats;
  sentAt: string;
}

// ─── API request/response DTOs ────────────────────────────────────────

export interface CreateGroupRequest {
  name: string;
  keyword: string;
  description?: string;
  active?: boolean;
}

export type UpdateGroupRequest = Partial<CreateGroupRequest>;

export interface BroadcastRequest {
  body: string;
}

export interface BroadcastResponse {
  message: BroadcastMessage;
}

export interface ListGroupsResponse {
  groups: Group[];
}

export interface GroupResponse {
  group: Group;
}

export interface ListGroupMembersResponse {
  members: GroupMember[];
}

export interface ListMessagesResponse {
  messages: BroadcastMessage[];
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}
