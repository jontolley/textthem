import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from '@clerk/fastify';
import { HttpError } from '../errors.js';

/**
 * Resolves the authenticated user id from a request, or null if unauthenticated.
 * The real implementation uses Clerk; tests inject a stub.
 */
export type Authenticator = (request: FastifyRequest) => Promise<string | null> | string | null;

export const clerkAuthenticator: Authenticator = (request) => {
  const { userId } = getAuth(request);
  return userId ?? null;
};

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  authenticator: Authenticator;
}

/**
 * Decorates the instance with `request.userId` and a `requireAuth` preHandler
 * that rejects unauthenticated requests with 401. Registered with `fp` so the
 * decorators are visible app-wide; the Clerk middleware itself is registered
 * separately and scoped to only the protected routes (see app.ts).
 */
export const authPlugin = fp<AuthPluginOptions>(async (fastify, opts) => {
  fastify.decorateRequest('userId', '');
  fastify.decorate('requireAuth', async (request: FastifyRequest) => {
    const userId = await opts.authenticator(request);
    if (!userId) {
      throw new HttpError(401, 'unauthorized', 'Authentication required');
    }
    request.userId = userId;
  });
});
