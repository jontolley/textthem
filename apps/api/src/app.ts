import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { clerkPlugin } from '@clerk/fastify';
import { ZodError } from 'zod';
import { databasePlugin, type Database } from './db/index.js';
import { authPlugin, clerkAuthenticator, type Authenticator } from './plugins/auth.js';
import { groupRoutes } from './routes/groups.js';
import { messageRoutes } from './routes/messages.js';
import { twilioRoutes } from './routes/twilio.js';
import { HttpError } from './errors.js';
import type { TwilioService } from './services/twilio.js';
import type { AppConfig } from './config.js';

export interface BuildAppOptions {
  config: AppConfig;
  twilio: TwilioService;
  /** Provide an existing connection (tests) or let the app connect itself. */
  database?: Database;
  /** Override the authenticator (tests inject a stub). */
  authenticator?: Authenticator;
  fastifyOptions?: FastifyServerOptions;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = opts;
  const app = Fastify(
    opts.fastifyOptions ?? {
      logger: { level: config.isProduction ? 'info' : 'debug' },
      // Allow extra time for the initial MongoDB connection on cold boot
      // (Fastify's default plugin timeout is 10s).
      pluginTimeout: 30_000,
    },
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'Request validation failed',
        details: error.issues,
      });
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: error.errorCode,
        message: error.message,
        details: error.details,
      });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'internal_error', message: 'Internal server error' });
  });

  await app.register(formbody); // parse Twilio's form-encoded webhook bodies
  await app.register(cors, { origin: config.corsOrigins, credentials: true });

  await app.register(
    databasePlugin,
    opts.database
      ? { database: opts.database }
      : { uri: config.MONGODB_URI, dbName: config.MONGODB_DB_NAME },
  );

  // A custom authenticator (tests) bypasses Clerk entirely.
  const usingClerk = !opts.authenticator;
  await app.register(authPlugin, {
    authenticator: opts.authenticator ?? clerkAuthenticator,
  });

  // ─── Public routes (no Clerk) ───────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok' }));
  await app.register(twilioRoutes, {
    twilio: opts.twilio,
    orgName: config.ORG_NAME,
    publicBaseUrl: config.PUBLIC_BASE_URL,
  });

  // ─── Protected routes (Clerk middleware scoped to this child) ────────
  await app.register(async (scope) => {
    if (usingClerk) {
      await scope.register(clerkPlugin, {
        secretKey: config.CLERK_SECRET_KEY,
        publishableKey: config.CLERK_PUBLISHABLE_KEY,
      });
    }
    await scope.register(groupRoutes);
    await scope.register(messageRoutes, { twilio: opts.twilio });
  });

  return app;
}
