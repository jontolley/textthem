import type { FastifyInstance } from 'fastify';
import type { MeResponse } from '@text-them/shared';

/**
 * Who the API thinks is signed in. The dashboard calls it first: a 403 here
 * means the account isn't an organizer, so it shows a no-access screen.
 */
export async function meRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.requireAuth);

  fastify.get('/api/me', async (request): Promise<MeResponse> => ({ userId: request.userId }));
}
