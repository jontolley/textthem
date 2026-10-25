import type { FastifyBaseLogger } from 'fastify';
import type { Collections } from '../db/index.js';
import type { MessageDoc } from '../db/documents.js';
import { recordSends } from './deliveries.js';
import type { TwilioService } from './twilio.js';

/** A scheduled broadcast more than this late (e.g. the API was down) is marked missed, not sent. */
export const MISSED_AFTER_MS = 60 * 60 * 1000;
/** A send still "sending" after this long was cut off (e.g. by a restart) and is marked interrupted. */
export const INTERRUPTED_AFTER_MS = 10 * 60 * 1000;

export interface BroadcastDeps {
  collections: Collections;
  twilio: TwilioService;
  /** Absolute URL of the Twilio status-callback route. */
  statusCallbackUrl: string;
}

/**
 * Texts a broadcast to the group's current subscribers and records the result.
 * The caller must already have moved it to "sending", which is what keeps it
 * from going out twice.
 */
export async function sendBroadcast(deps: BroadcastDeps, broadcast: MessageDoc): Promise<MessageDoc> {
  const { subscriptions, members, messages, deliveries } = deps.collections;

  const subs = await subscriptions
    .find({ groupId: broadcast.groupId, status: 'subscribed' })
    .toArray();
  const memberDocs = await members.find({ _id: { $in: subs.map((s) => s.memberId) } }).toArray();
  const recipients = memberDocs.map((m) => m.phoneNumber);

  const { accepted, failed } =
    recipients.length > 0
      ? await deps.twilio.sendBulk(recipients, broadcast.body, {
          statusCallback: deps.statusCallbackUrl,
        })
      : { accepted: [], failed: 0 };
  await recordSends(deliveries, broadcast._id, accepted);

  const result = {
    status: 'sent' as const,
    recipientCount: recipients.length,
    acceptedCount: accepted.length,
    failedCount: failed,
    sentAt: new Date(),
  };
  await messages.updateOne({ _id: broadcast._id }, { $set: result });
  return { ...broadcast, ...result };
}

export interface DueRunResult {
  sent: number;
  missed: number;
  interrupted: number;
}

/**
 * One scheduler pass: marks broadcasts that are too late as missed, flags
 * sends that were cut off, then sends everything due. Safe to run from
 * several places at once: each broadcast is claimed atomically before sending.
 */
export async function runDueBroadcasts(
  deps: BroadcastDeps,
  now: Date = new Date(),
): Promise<DueRunResult> {
  const { messages } = deps.collections;

  const missed = await messages.updateMany(
    { status: 'scheduled', scheduledFor: { $lt: new Date(now.getTime() - MISSED_AFTER_MS) } },
    { $set: { status: 'missed' } },
  );
  const interrupted = await messages.updateMany(
    {
      status: 'sending',
      sendingStartedAt: { $lt: new Date(now.getTime() - INTERRUPTED_AFTER_MS) },
    },
    { $set: { status: 'interrupted' } },
  );

  let sent = 0;
  for (;;) {
    const claimed = await messages.findOneAndUpdate(
      { status: 'scheduled', scheduledFor: { $lte: now } },
      { $set: { status: 'sending', sendingStartedAt: new Date() } },
      { sort: { scheduledFor: 1 }, returnDocument: 'after' },
    );
    if (!claimed) break;
    await sendBroadcast(deps, claimed);
    sent++;
  }

  return { sent, missed: missed.modifiedCount, interrupted: interrupted.modifiedCount };
}

export interface Scheduler {
  /** Stops the timer and waits for a pass in progress to finish. */
  stop(): Promise<void>;
}

/**
 * Runs `runDueBroadcasts` now (to catch up after a restart) and then every
 * `intervalMs`. A pass that is still running when the next one is due is not
 * overlapped. `onChange` runs after a pass that sent or marked anything.
 */
export function startScheduler(
  deps: BroadcastDeps,
  intervalMs: number,
  log: FastifyBaseLogger,
  onChange: () => void = () => {},
): Scheduler {
  let running: Promise<void> | null = null;

  const tick = () => {
    if (running) return;
    running = runDueBroadcasts(deps)
      .then((result) => {
        if (result.sent || result.missed || result.interrupted) {
          log.info(result, 'Scheduled broadcasts processed');
          onChange();
        }
      })
      .catch((err) => {
        log.error(err, 'Scheduled broadcast pass failed');
        onChange(); // it may have claimed or sent some before failing
      })
      .finally(() => {
        running = null;
      });
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  return {
    async stop() {
      clearInterval(timer);
      await running;
    },
  };
}
