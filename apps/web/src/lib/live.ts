import type { ChangeEvent, ChangeTopic } from '@text-them/shared';
import { API_BASE_URL, type TokenGetter } from './api';

/** The API sends a heartbeat every 25s, so this long with nothing means the connection died. */
const SILENCE_LIMIT_MS = 60_000;
/** A stream that ends sooner than this counts as a failure, so a server that keeps ending them isn't hammered. */
const MIN_HEALTHY_STREAM_MS = 5_000;
const MAX_RETRY_DELAY_MS = 30_000;

const TOPICS: readonly ChangeTopic[] = ['groups', 'messages'];

export interface LiveUpdateHandlers {
  onChange(topic: ChangeTopic): void;
  /** After a dropped stream reconnects: notices may have been missed in between. */
  onReconnect(): void;
}

/**
 * Keeps the API's change stream (`GET /api/events`) open until `signal`
 * aborts, passing its notices on. It reads the stream with fetch, not
 * EventSource, because EventSource can't send the Clerk token as a header (and
 * tokens don't belong in URLs). The server ends each stream every 15 minutes
 * to recheck sign-in; that reconnects at once. Failures retry with back-off.
 */
export async function runLiveUpdates(
  getToken: TokenGetter,
  handlers: LiveUpdateHandlers,
  signal: AbortSignal,
): Promise<void> {
  let everConnected = false;
  let failures = 0;

  while (!signal.aborted) {
    let openedAt = 0;
    try {
      await streamOnce(getToken, signal, {
        onOpen() {
          openedAt = Date.now();
          if (everConnected) handlers.onReconnect();
          everConnected = true;
        },
        onChange: handlers.onChange,
      });
      if (Date.now() - openedAt < MIN_HEALTHY_STREAM_MS) throw new Error('Stream ended early');
      failures = 0;
    } catch {
      if (signal.aborted) return;
      failures++;
      await sleep(retryDelay(failures), signal);
    }
  }
}

/** 1s, 2s, 4s, … up to 30s, with jitter so tabs don't all retry at once. */
function retryDelay(failures: number): number {
  const base = Math.min(1000 * 2 ** (failures - 1), MAX_RETRY_DELAY_MS);
  return base / 2 + Math.random() * (base / 2);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

/** Opens one stream and reads it until the server ends it; throws if it fails or goes silent. */
async function streamOnce(
  getToken: TokenGetter,
  signal: AbortSignal,
  handlers: { onOpen(): void; onChange(topic: ChangeTopic): void },
): Promise<void> {
  // Aborts this attempt only: when the page is done with it, or it goes silent.
  const attempt = new AbortController();
  const stop = () => attempt.abort();
  signal.addEventListener('abort', stop, { once: true });
  let silence: ReturnType<typeof setTimeout> | undefined;
  const heardFromServer = () => {
    clearTimeout(silence);
    silence = setTimeout(stop, SILENCE_LIMIT_MS);
  };

  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE_URL}/api/events`, {
      headers: {
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: attempt.signal,
    });
    if (!res.ok || !res.body) throw new Error(`Live updates unavailable (${res.status})`);
    handlers.onOpen();
    heardFromServer();

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      heardFromServer();
      buffer += value;
      // Events are separated by a blank line; keep any partial one for later.
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const topic = parseTopic(block);
        if (topic) handlers.onChange(topic);
      }
    }
  } finally {
    clearTimeout(silence);
    signal.removeEventListener('abort', stop);
  }
}

/** The topic of a `data:` block; comments (heartbeats) and anything unknown give null. */
function parseTopic(block: string): ChangeTopic | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .join('\n');
  if (!data) return null;
  try {
    const { topic } = JSON.parse(data) as ChangeEvent;
    return TOPICS.includes(topic) ? topic : null;
  } catch {
    return null;
  }
}
