import type { ChangeTopic } from '@text-them/shared';

/** Each topic's notice goes out at most this often; changes in between are folded into one. */
export const NOTIFY_INTERVAL_MS = 1000;

export type ChangeListener = (topic: ChangeTopic) => void;

/**
 * Tells open dashboards that data changed (see `routes/events.ts`). It lives in
 * memory, which works because production runs a single API machine. With more
 * machines, a change on one wouldn't reach dashboards connected to another, and
 * this would need MongoDB change streams instead.
 */
export interface ChangeNotifier {
  notify(topic: ChangeTopic): void;
  /** Returns a function that unsubscribes the listener. */
  subscribe(listener: ChangeListener): () => void;
  /** Drops listeners and pending notices. */
  close(): void;
}

declare module 'fastify' {
  interface FastifyInstance {
    events: ChangeNotifier;
  }
}

/**
 * Throttles each topic: the first change goes out at once, and any further
 * changes within `intervalMs` go out as one notice when the interval ends. A
 * broadcast's burst of Twilio delivery callbacks becomes about one refetch a
 * second instead of hundreds.
 */
export function createChangeNotifier(intervalMs = NOTIFY_INTERVAL_MS): ChangeNotifier {
  const listeners = new Set<ChangeListener>();
  const timers = new Map<ChangeTopic, NodeJS.Timeout>();
  const pending = new Set<ChangeTopic>();

  function emit(topic: ChangeTopic): void {
    for (const listener of listeners) {
      try {
        listener(topic);
      } catch {
        // One broken stream mustn't stop the notice reaching the others.
      }
    }
    const timer = setTimeout(() => {
      timers.delete(topic);
      if (pending.delete(topic)) emit(topic);
    }, intervalMs);
    timer.unref();
    timers.set(topic, timer);
  }

  return {
    notify(topic) {
      if (timers.has(topic)) pending.add(topic);
      else emit(topic);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      pending.clear();
      listeners.clear();
    },
  };
}
