import { PassThrough } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import type { ChangeEvent } from '@text-them/shared';

/** A comment line this often keeps proxies (Fly's included) from dropping a quiet stream. */
export const HEARTBEAT_MS = 25_000;
/**
 * Streams end after this long and the dashboard reconnects, which reruns the
 * sign-in and organizer checks with a fresh token. Clerk tokens expire within a
 * minute, so without this an open stream would outlive the token that opened it.
 */
export const MAX_STREAM_MS = 15 * 60_000;

export interface EventRoutesOptions {
  heartbeatMs?: number;
  maxStreamMs?: number;
}

/**
 * `GET /api/events`: a Server-Sent Events stream of change notices for the
 * dashboard. A notice names a topic and carries no data; the dashboard refetches
 * it through the normal endpoints, so data still only reaches the page there.
 */
export async function eventRoutes(
  fastify: FastifyInstance,
  opts: EventRoutesOptions,
): Promise<void> {
  const heartbeatMs = opts.heartbeatMs ?? HEARTBEAT_MS;
  const maxStreamMs = opts.maxStreamMs ?? MAX_STREAM_MS;
  /** Ends each open stream; used on shutdown. */
  const openStreams = new Set<() => void>();

  fastify.addHook('preHandler', fastify.requireAuth);

  // Open streams would otherwise hold app.close() (and so a deploy) open.
  fastify.addHook('preClose', async () => {
    for (const end of openStreams) end();
  });

  fastify.get('/api/events', async (_request, reply) => {
    const stream = new PassThrough();
    const write = (chunk: string) => {
      // The client may already be gone; writing then would raise an error.
      if (stream.writable) stream.write(chunk);
    };

    const unsubscribe = fastify.events.subscribe((topic) => {
      const event: ChangeEvent = { topic };
      write(`data: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => write(': ping\n\n'), heartbeatMs);
    const expiry = setTimeout(end, maxStreamMs);

    let ended = false;
    function end() {
      if (ended) return;
      ended = true;
      unsubscribe();
      clearInterval(heartbeat);
      clearTimeout(expiry);
      openStreams.delete(end);
      stream.end();
    }
    openStreams.add(end);
    reply.raw.on('close', end); // the client disconnected, or the stream finished

    // Sends the headers right away, so the dashboard knows it's connected.
    write(': connected\n\n');
    return reply
      .header('Content-Type', 'text/event-stream; charset=utf-8')
      .header('Cache-Control', 'no-cache, no-transform')
      .header('X-Accel-Buffering', 'no')
      .send(stream);
  });
}
