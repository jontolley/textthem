import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from '@clerk/fastify';
import { HttpError } from '../errors.js';

/**
 * Resolves the authenticated user id from a request, or null if unauthenticated.
 * The real implementation uses Clerk; tests inject a stub.
 */
export type Authenticator = (request: FastifyRequest) => Promise<string | null> | string | null;

/**
 * Clerk-backed authenticator. Only accepts session tokens minted for one of
 * `authorizedParties` (the dashboard's origins): Clerk's `azp` claim names the
 * origin that requested the token, so a token issued to another site on the
 * same Clerk instance can't be replayed here. Clerk recommends this for
 * production; tokens without `azp` are judged the same way Clerk does (allowed).
 */
export function clerkAuthenticator(authorizedParties: string[]): Authenticator {
  return (request) => {
    const { userId, sessionClaims } = getAuth(request);
    if (!userId) return null;
    const azp = sessionClaims?.azp;
    if (typeof azp === 'string' && !authorizedParties.includes(azp)) return null;
    return userId;
  };
}

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
  /** Signed-in users allowed through; empty allows any signed-in user (local dev). */
  organizerUserIds: string[];
}

/**
 * Decorates the instance with `request.userId` and a `requireAuth` preHandler
 * that rejects unauthenticated requests with 401, and signed-in users who
 * aren't organizers with 403. Registered with `fp` so the
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
    const { organizerUserIds } = opts;
    if (organizerUserIds.length > 0 && !organizerUserIds.includes(userId)) {
      throw new HttpError(403, 'forbidden', "This account doesn't have access to Text Them");
    }
    request.userId = userId;
  });
});
