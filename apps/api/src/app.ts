import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { clerkPlugin } from '@clerk/fastify';
import { ZodError } from 'zod';
import { databasePlugin, type Database } from './db/index.js';
import { authPlugin, clerkAuthenticator, type Authenticator } from './plugins/auth.js';
import { groupRoutes } from './routes/groups.js';
import { messageRoutes } from './routes/messages.js';
import { inboundRoutes } from './routes/inbound.js';
import { STATUS_CALLBACK_PATH, twilioRoutes } from './routes/twilio.js';
import { meRoutes } from './routes/me.js';
import { versionRoutes } from './routes/version.js';
import { eventRoutes, type EventRoutesOptions } from './routes/events.js';
import { HttpError } from './errors.js';
import { startScheduler, type Scheduler } from './services/broadcasts.js';
import { createChangeNotifier, type ChangeNotifier } from './services/events.js';
import type { TwilioService } from './services/twilio.js';
import type { AppConfig } from './config.js';

export interface BuildAppOptions {
  config: AppConfig;
  twilio: TwilioService;
  /** Provide an existing connection (tests) or let the app connect itself. */
  database?: Database;
  /** Override the authenticator (tests inject a stub). */
  authenticator?: Authenticator;
  /**
   * Check for due scheduled broadcasts this often (production). Left unset in
   * tests, which run the scheduler pass directly.
   */
  schedulerIntervalMs?: number;
  /** Override the live-update notifier (tests inject one without throttling). */
  events?: ChangeNotifier;
  /** Override the live-update stream's timings (tests shorten them). */
  eventStream?: EventRoutesOptions;
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

  // Routes and the scheduler announce changes here; open dashboards hear them.
  const events = opts.events ?? createChangeNotifier();
  app.decorate('events', events);
  app.addHook('onClose', async () => events.close());

  // A custom authenticator (tests) bypasses Clerk entirely.
  const usingClerk = !opts.authenticator;
  await app.register(authPlugin, {
    // The dashboard's origins are exactly the CORS origins.
    authenticator: opts.authenticator ?? clerkAuthenticator(config.corsOrigins),
    organizerUserIds: config.ORGANIZER_USER_IDS,
  });

  // ─── Public routes (no Clerk) ───────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok' }));
  await app.register(twilioRoutes, {
    twilio: opts.twilio,
    orgName: config.ORG_NAME,
    supportEmail: config.SUPPORT_EMAIL,
    publicBaseUrl: config.PUBLIC_BASE_URL,
  });

  const statusCallbackUrl = new URL(STATUS_CALLBACK_PATH, config.PUBLIC_BASE_URL).toString();

  // ─── Protected routes (Clerk middleware scoped to this child) ────────
  await app.register(async (scope) => {
    if (usingClerk) {
      await scope.register(clerkPlugin, {
        secretKey: config.CLERK_SECRET_KEY,
        publishableKey: config.CLERK_PUBLISHABLE_KEY,
      });
    }
    await scope.register(groupRoutes);
    await scope.register(messageRoutes, { twilio: opts.twilio, statusCallbackUrl });
    await scope.register(inboundRoutes);
    await scope.register(versionRoutes, { commit: config.GIT_SHA, builtAt: config.BUILT_AT });
    await scope.register(meRoutes);
    await scope.register(eventRoutes, opts.eventStream ?? {});
  });

  // ─── Scheduled broadcasts ───────────────────────────────────────────
  const { schedulerIntervalMs } = opts;
  if (schedulerIntervalMs) {
    let scheduler: Scheduler | undefined;
    app.addHook('onReady', async () => {
      scheduler = startScheduler(
        { collections: app.mongo.collections, twilio: opts.twilio, statusCallbackUrl },
        schedulerIntervalMs,
        app.log,
        () => events.notify('messages'),
      );
    });
    // Let a pass in progress finish before the database connection closes.
    app.addHook('preClose', async () => {
      await scheduler?.stop();
    });
  }

  return app;
}
