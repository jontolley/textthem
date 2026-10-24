import type { FastifyInstance } from 'fastify';
import type { VersionResponse } from '@text-them/shared';

export interface VersionRoutesDeps {
  commit?: string;
  builtAt?: string;
}

/** Which build of the API is running (signed-in users only, so the commit isn't public). */
export async function versionRoutes(
  fastify: FastifyInstance,
  deps: VersionRoutesDeps,
): Promise<void> {
  fastify.addHook('preHandler', fastify.requireAuth);

  fastify.get('/api/version', async (): Promise<VersionResponse> => ({
    api: { commit: deps.commit ?? null, builtAt: deps.builtAt ?? null },
  }));
}
