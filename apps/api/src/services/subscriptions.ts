import { ObjectId } from 'mongodb';
import type { InboundAction } from '@text-them/shared';
import type { Collections } from '../db/index.js';

const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
// Twilio's reserved opt-in keywords: they lift Twilio's STOP block. STOP left
// the member in no groups, so they still need a group keyword to rejoin; Twilio's
// own START reply (set in its Opt-Out Management) tells them so.
const START_KEYWORDS = new Set(['START', 'UNSTOP']);
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
  /**
   * Reply to send back to the sender via TwiML, if any. STOP and START get none:
   * Twilio's opt-out handling already answers them (and blocks our STOP reply
   * with error 21610), so a reply from us would be a failure or a duplicate.
   */
  reply?: string;
}

export interface ProcessInboundDeps {
  collections: Collections;
  orgName: string;
  /** Contact address appended to the HELP reply, if set. */
  supportEmail?: string;
}

/**
 * Applies an inbound SMS to subscription state and returns the reply.
 * Order matters: STOP, START, and HELP are checked before group keywords so
 * they always win (carrier compliance).
 */
export async function processInbound(
  deps: ProcessInboundDeps,
  fromNumber: string,
  rawBody: string,
): Promise<InboundResult> {
  const { collections, orgName, supportEmail } = deps;
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
    return { action: 'stop' };
  }

  if (START_KEYWORDS.has(body)) {
    return { action: 'start' };
  }

  // With Advanced Opt-Out on, Twilio answers HELP itself and the route skips this
  // reply (OptOutType is set). Without it, Twilio answers HELP and never forwards
  // it. So this reply is only a fallback if neither applies.
  if (HELP_KEYWORDS.has(body)) {
    return {
      action: 'help',
      reply: `${orgName}: Reply with a group keyword to join. Reply STOP to unsubscribe. Msg & data rates may apply.${supportEmail ? ` Contact ${supportEmail}.` : ''}`,
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
      reply: `${orgName}: You've joined ${group.name}. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`,
    };
  }

  return { action: 'unknown', reply: await unknownReply(collections, orgName, fromNumber) };
}

/**
 * Members get told their texts aren't read (they show up on the dashboard's
 * Replies page, but nobody is notified). Anyone in no group most likely
 * mistyped a keyword, so they get the keywords they can text.
 * Keep the apostrophes straight: a curly one makes the text UCS-2, which cuts
 * one SMS from 160 characters to 70.
 */
async function unknownReply(
  collections: Collections,
  orgName: string,
  fromNumber: string,
): Promise<string> {
  const member = await collections.members.findOne({ phoneNumber: fromNumber });
  const inAGroup =
    member !== null &&
    (await collections.subscriptions.countDocuments(
      { memberId: member._id, status: 'subscribed' },
      { limit: 1 },
    )) > 0;
  if (inAGroup) {
    return `${orgName}: Texts to this number aren't actively read. Reply HELP for help or STOP to opt out.`;
  }

  const keywords = (
    await collections.groups
      .find({ active: true }, { projection: { keyword: 1 } })
      .sort({ keyword: 1 })
      .toArray()
  ).map((g) => g.keyword);
  const options =
    keywords.length > 0
      ? ` Text one of these to join: ${keywords.join(', ')}.`
      : ' There are no groups to join right now.';
  return `${orgName}: Keyword not recognized.${options} Reply HELP for help or STOP to opt out.`;
}
