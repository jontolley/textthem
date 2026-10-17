/**
 * One-off backfill of delivery status for broadcasts sent before delivery
 * tracking existed. Those stored only acceptedCount/failedCount (no Message
 * SIDs), so History shows "Delivery not tracked". For each one this finds its
 * texts in Twilio's message log and records their current status in
 * `deliveries`, the same way a live send and its status callbacks would.
 *
 * Dry run by default; pass --write to save. Safe to re-run: deliveries are
 * upserted by SID, and broadcasts that already have deliveries are skipped.
 * (connectDatabase still ensures the app's indexes, a no-op once the API has booted.)
 *
 * Run (Node 22+ reads and merges both env files: prod Mongo URI + Twilio creds):
 *   node --env-file=apps/api/.env.production.local --env-file=apps/api/.env.local \
 *     --import tsx apps/api/scripts/backfill-deliveries.ts [--write]
 *
 * Required env: MONGODB_URI, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 *   and one or both of TWILIO_MESSAGING_SERVICE_SID | TWILIO_FROM_NUMBER (a text
 *   from either counts as ours). MONGODB_DB_NAME defaults to textthem.
 *
 * Matching: a broadcast's texts are outbound-api messages from our sender with
 * the same body, created from 5 minutes before to 1 minute after its sentAt
 * (stamped once all sends return). Candidates are everyone who ever subscribed
 * to the group: rejoining overwrites subscribedAt, so the list at sentAt can't
 * be rebuilt exactly, and someone who didn't get it simply has no matching text.
 * A group with no subscriptions left (deleted) falls back to all of Twilio's
 * texts around sentAt.
 *
 * A broadcast stays untracked, with the reason printed, unless each accepted
 * send matches exactly one text: several matching texts for one recipient,
 * a match count that differs from acceptedCount, or a text another broadcast
 * also matches all leave it alone.
 */
import twilio from 'twilio';
import type { ObjectId } from 'mongodb';
import { connectDatabase } from '../src/db/index.js';
import type { MessageDoc } from '../src/db/documents.js';
import { deliveryBucket, recordSends, recordStatus } from '../src/services/deliveries.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const write = process.argv.includes('--write');
const mongoUri = required('MONGODB_URI');
const dbName = process.env.MONGODB_DB_NAME ?? 'textthem';
const accountSid = required('TWILIO_ACCOUNT_SID');
const authToken = required('TWILIO_AUTH_TOKEN');
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

if (!messagingServiceSid && !fromNumber) {
  console.error('Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER');
  process.exit(1);
}

const WINDOW_BEFORE_MS = 5 * 60_000;
const WINDOW_AFTER_MS = 60_000;

const client = twilio(accountSid, authToken);
type Text = Awaited<ReturnType<typeof client.messages.list>>[number];

const { client: mongo, collections } = await connectDatabase(mongoUri, dbName);
const { groups, members, subscriptions, messages, deliveries } = collections;

/** A recipient's one matching text. */
interface Match {
  sid: string;
  to: string;
  status: string;
  errorCode?: string;
}

interface Plan {
  broadcast: MessageDoc;
  matches: Match[];
  /** SIDs of every text that matched, including a recipient's duplicates. */
  claimed: string[];
  /** Why the broadcast is left untracked; empty when it can be recorded. */
  problems: string[];
}

const mask = (phone: string) => `…${phone.slice(-4)}`;

/** Texts sent to one number, fetched once and shared across broadcasts. */
const textsByRecipient = new Map<string, Text[]>();
async function textsTo(to: string): Promise<Text[]> {
  let texts = textsByRecipient.get(to);
  if (!texts) {
    // No date filter: a text Twilio never sent has no DateSent and would drop out.
    texts = await client.messages.list({ to, pageSize: 1000 });
    textsByRecipient.set(to, texts);
  }
  return texts;
}

async function candidateTexts(b: MessageDoc): Promise<Text[]> {
  const subs = await subscriptions.find({ groupId: b.groupId }).toArray();
  if (subs.length === 0) {
    // Twilio may apply DateSent by day only; planFor narrows to the window.
    const hour = 60 * 60_000;
    return client.messages.list({
      dateSentAfter: new Date(b.sentAt.getTime() - hour),
      dateSentBefore: new Date(b.sentAt.getTime() + hour),
      pageSize: 1000,
    });
  }
  const docs = await members.find({ _id: { $in: subs.map((s) => s.memberId) } }).toArray();
  const texts: Text[] = [];
  for (const m of docs) texts.push(...(await textsTo(m.phoneNumber)));
  return texts;
}

function planFor(b: MessageDoc, texts: Text[]): Plan {
  const start = b.sentAt.getTime() - WINDOW_BEFORE_MS;
  const end = b.sentAt.getTime() + WINDOW_AFTER_MS;
  const ours = texts.filter(
    (t) =>
      t.direction === 'outbound-api' &&
      ((!!messagingServiceSid && t.messagingServiceSid === messagingServiceSid) ||
        (!!fromNumber && t.from === fromNumber)) &&
      t.dateCreated.getTime() >= start &&
      t.dateCreated.getTime() <= end,
  );
  const same = ours.filter((t) => t.body === b.body);

  const byRecipient = new Map<string, Text[]>();
  for (const t of same) byRecipient.set(t.to, [...(byRecipient.get(t.to) ?? []), t]);

  const matches: Match[] = [];
  const problems: string[] = [];
  for (const [to, [t, ...more]] of byRecipient) {
    if (more.length > 0) {
      problems.push(`${mask(to)} has ${more.length + 1} matching texts`);
    } else {
      matches.push({
        sid: t.sid,
        to,
        status: t.status,
        ...(t.errorCode ? { errorCode: String(t.errorCode) } : {}),
      });
    }
  }

  if (byRecipient.size < b.acceptedCount) {
    const otherBody = ours.length - same.length;
    problems.push(
      `no text found for ${b.acceptedCount - byRecipient.size} of the accepted sends` +
        (otherBody > 0 ? ` (${otherBody} of our texts in the window have a different body)` : ''),
    );
  } else if (byRecipient.size > b.acceptedCount) {
    problems.push(`${byRecipient.size} recipients have a matching text, more than were accepted`);
  }
  return { broadcast: b, matches, claimed: same.map((t) => t.sid), problems };
}

function summarize(matches: Match[]): string {
  const buckets = { delivered: 0, undelivered: 0, pending: 0 };
  const statuses = new Map<string, number>();
  for (const m of matches) {
    buckets[deliveryBucket(m.status)]++;
    const key = m.errorCode ? `${m.status} ${m.errorCode}` : m.status;
    statuses.set(key, (statuses.get(key) ?? 0) + 1);
  }
  const detail = [...statuses]
    .sort(([, x], [, y]) => y - x)
    .map(([key, n]) => `${key} ×${n}`)
    .join(', ');
  return `delivered ${buckets.delivered} · undelivered ${buckets.undelivered} · pending ${buckets.pending}  (${detail})`;
}

async function record(broadcastId: ObjectId, matches: Match[]): Promise<void> {
  // Status first, as when a callback beats the send. If the run dies between
  // the two steps, the docs lack broadcastId and a re-run retries the broadcast.
  for (const m of matches) {
    await recordStatus(deliveries, { sid: m.sid, status: m.status, errorCode: m.errorCode });
  }
  await recordSends(deliveries, broadcastId, matches);
}

try {
  const sent = await messages.find({ acceptedCount: { $gt: 0 } }).sort({ sentAt: 1 }).toArray();
  const tracked = new Set(
    (await deliveries.distinct('broadcastId', { broadcastId: { $in: sent.map((b) => b._id) } })).map(
      String,
    ),
  );
  const untracked = sent.filter((b) => !tracked.has(b._id.toHexString()));
  const groupNames = new Map(
    (await groups.find({ _id: { $in: untracked.map((b) => b.groupId) } }).toArray()).map((g) => [
      g._id.toHexString(),
      g.name,
    ]),
  );

  const plans: Plan[] = [];
  for (const b of untracked) plans.push(planFor(b, await candidateTexts(b)));

  // A text inside two broadcasts' windows can't be attributed to either of them.
  const claims = new Map<string, number>();
  for (const p of plans) for (const sid of p.claimed) claims.set(sid, (claims.get(sid) ?? 0) + 1);
  const recorded = new Set(
    (
      await deliveries
        .find({ twilioSid: { $in: [...claims.keys()] }, broadcastId: { $exists: true } })
        .toArray()
    ).map((d) => d.twilioSid),
  );
  for (const p of plans) {
    const shared = p.claimed.filter((sid) => claims.get(sid)! > 1).length;
    if (shared > 0) p.problems.push(`${shared} matching texts also match another broadcast`);
    const taken = p.claimed.filter((sid) => recorded.has(sid)).length;
    if (taken > 0) p.problems.push(`${taken} matching texts are already recorded for another broadcast`);
  }

  console.log(
    `${write ? 'Writing' : 'Dry run'}: ${untracked.length} broadcasts predate delivery tracking ` +
      `(${sent.length - untracked.length} already tracked).`,
  );
  for (const p of plans) {
    const b = p.broadcast;
    const group = groupNames.get(b.groupId.toHexString()) ?? '(deleted group)';
    const body = b.body.replace(/\s+/g, ' ');
    const preview = body.length > 40 ? `${body.slice(0, 40)}…` : body;
    console.log(`\n${b.sentAt.toISOString()}  ${group}  "${preview}"  [${b._id.toHexString()}]`);
    console.log(`  matched ${p.matches.length} of ${b.acceptedCount} accepted sends`);
    if (p.matches.length > 0) console.log(`  ${summarize(p.matches)}`);
    if (p.problems.length > 0) {
      console.log(`  ✗ left untracked: ${p.problems.join('; ')}`);
    } else if (write) {
      await record(b._id, p.matches);
      console.log(`  ✓ recorded ${p.matches.length} deliveries`);
    } else {
      console.log(`  ✓ would record ${p.matches.length} deliveries`);
    }
  }

  const ready = plans.filter((p) => p.problems.length === 0);
  const count = ready.reduce((n, p) => n + p.matches.length, 0);
  console.log(
    `\n${ready.length} of ${plans.length} broadcasts ${write ? 'backfilled' : 'can be backfilled'} ` +
      `(${count} deliveries); ${plans.length - ready.length} left untracked.`,
  );
  if (!write && ready.length > 0) console.log('Nothing written. Re-run with --write to record them.');
} finally {
  await mongo.close();
}
