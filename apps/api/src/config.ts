import { z } from 'zod';

/**
 * Parses and validates process environment into a typed config object.
 * Throws on startup if required variables are missing/invalid.
 */
const R2_KEYS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_URL',
] as const;

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
  // Contact address included in HELP replies (carriers require contact info).
  SUPPORT_EMAIL: z.string().email().default('info@textthem.app'),

  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),

  // Stamped into the image by the deploy (Dockerfile build args); unset locally.
  GIT_SHA: z.string().optional().transform((v) => v || undefined),
  BUILT_AT: z.string().optional().transform((v) => v || undefined),

  // Clerk user IDs allowed to use the dashboard API, comma-separated. Required in
  // production, so access never depends on Clerk's sign-up setting alone; empty
  // locally means any signed-in user.
  ORGANIZER_USER_IDS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((id) => id.trim()).filter(Boolean)),

  // Cloudflare R2 bucket for broadcast images (MMS). Set all five or none. With
  // none, production can't attach images and local dev keeps them in .media/.
  // R2_PUBLIC_URL is the bucket's public address, e.g. https://media.textthem.app.
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
}).refine((env) => env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM_NUMBER, {
  message: 'Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER (at least one)',
  path: ['TWILIO_MESSAGING_SERVICE_SID'],
}).refine((env) => env.NODE_ENV !== 'production' || env.ORGANIZER_USER_IDS.length > 0, {
  message: 'Set ORGANIZER_USER_IDS (comma-separated Clerk user IDs) in production',
  path: ['ORGANIZER_USER_IDS'],
}).refine((env) => {
  const set = R2_KEYS.filter((k) => env[k]).length;
  return set === 0 || set === R2_KEYS.length;
}, {
  message: 'Set all of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL, or none',
  path: ['R2_ACCOUNT_ID'],
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
    r2:
      data.R2_ACCOUNT_ID &&
      data.R2_ACCESS_KEY_ID &&
      data.R2_SECRET_ACCESS_KEY &&
      data.R2_BUCKET &&
      data.R2_PUBLIC_URL
        ? {
            R2_ACCOUNT_ID: data.R2_ACCOUNT_ID,
            R2_ACCESS_KEY_ID: data.R2_ACCESS_KEY_ID,
            R2_SECRET_ACCESS_KEY: data.R2_SECRET_ACCESS_KEY,
            R2_BUCKET: data.R2_BUCKET,
            R2_PUBLIC_URL: data.R2_PUBLIC_URL,
          }
        : undefined,
  };
}
