import { ObjectId } from 'mongodb';
import type { InboundAction } from '@text-them/shared';
import type { Collections } from '../db/index.js';

const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const HELP_KEYWORDS = new Set(['HELP', 'INFO']);

export function normalizeBody(body: string): string {
  return body.trim().toUpperCase();
}

/** Finds or creates a member by phone number, returning its id. */
export async function upsertMember(
  collections: Collections,
  phoneNumber: string,
): Promise<ObjectId> {
  const now = new Date();
  const result = await collections.members.findOneAndUpdate(
    { phoneNumber },
    { $setOnInsert: { phoneNumber, createdAt: now } },
    { upsert: true, returnDocument: 'after' },
  );
  // returnDocument 'after' with upsert always yields a document.
  return result!._id;
}

export interface InboundResult {
  action: InboundAction;
  matchedKeyword?: string;
  /** Reply to send back to the sender via TwiML. */
  reply: string;
}

export interface ProcessInboundDeps {
  collections: Collections;
  orgName: string;
}

/**
 * Applies an inbound SMS to subscription state and returns the reply.
 * Order matters: STOP and HELP are checked before group keywords so they always
 * win (carrier compliance).
 */
export async function processInbound(
  deps: ProcessInboundDeps,
  fromNumber: string,
  rawBody: string,
): Promise<InboundResult> {
  const { collections, orgName } = deps;
  const body = normalizeBody(rawBody);
  const now = new Date();

  if (STOP_KEYWORDS.has(body)) {
    const member = await collections.members.findOne({ phoneNumber: fromNumber });
    if (member) {
      await collections.subscriptions.updateMany(
        { memberId: member._id, status: 'subscribed' },
        { $set: { status: 'unsubscribed', unsubscribedAt: now } },
      );
    }
    return {
      action: 'stop',
      reply: `You have been unsubscribed from all ${orgName} messages and will receive no further texts. Reply HELP for help.`,
    };
  }

  if (HELP_KEYWORDS.has(body)) {
    return {
      action: 'help',
      reply: `${orgName}: Reply with a group keyword to join. Reply STOP to unsubscribe. Msg & data rates may apply.`,
    };
  }

  const group = await collections.groups.findOne({ keyword: body, active: true });
  if (group) {
    const memberId = await upsertMember(collections, fromNumber);
    await collections.subscriptions.updateOne(
      { memberId, groupId: group._id },
      {
        $set: { status: 'subscribed', source: 'sms', subscribedAt: now },
        $unset: { unsubscribedAt: '' },
        $setOnInsert: { memberId, groupId: group._id },
      },
      { upsert: true },
    );
    return {
      action: 'join',
      matchedKeyword: group.keyword,
      reply: `You've joined ${group.name}. Reply STOP to leave, HELP for help. Msg & data rates may apply.`,
    };
  }

  return {
    action: 'unknown',
    reply: `Sorry, we didn't recognize that keyword. Reply HELP for help.`,
  };
}
