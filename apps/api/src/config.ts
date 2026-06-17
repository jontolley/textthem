import { z } from 'zod';

/**
 * Parses and validates process environment into a typed config object.
 * Throws on startup if required variables are missing/invalid.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),

  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z.string().min(1).default('textthem'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  // Outbound sender: provide EITHER a Messaging Service SID (recommended once you
  // scale / register A2P 10DLC) OR a plain Twilio "from" number in E.164. At
  // least one is required — validated below.
  TWILIO_MESSAGING_SERVICE_SID: z.string().min(1).optional(),
  TWILIO_FROM_NUMBER: z.string().min(1).optional(),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:8080'),
  TWILIO_SKIP_SIGNATURE_VALIDATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  ORG_NAME: z.string().default('Our Organization'),

  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
}).refine((env) => env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM_NUMBER, {
  message: 'Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER (at least one)',
  path: ['TWILIO_MESSAGING_SERVICE_SID'],
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const data = parsed.data;
  return {
    ...data,
    corsOrigins: data.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    isProduction: data.NODE_ENV === 'production',
  };
}
