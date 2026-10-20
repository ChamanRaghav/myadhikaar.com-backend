import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const list = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),

  /** Public URL of the website, used in emails and payment return links */
  APP_URL: z.string().url().default('https://myadhikaar.com'),
  /** Public URL of this API, used for payment webhooks */
  API_URL: z.string().url().optional(),
  /** Allowed browser origins; defaults to APP_URL */
  CORS_ORIGINS: list,

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(3600),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  GOOGLE_CLIENT_ID: optional,

  /** Comma-separated inboxes that receive admin notifications */
  ADMIN_EMAILS: list,
  EMAIL_FROM: z.string().default('MyAdhikaar <support@myadhikaar.com>'),
  RESEND_API_KEY: optional,

  CASHFREE_APP_ID: optional,
  CASHFREE_SECRET_KEY: optional,
  /** sandbox | production; inferred from a TEST… app id when unset */
  CASHFREE_ENV: z.enum(['sandbox', 'production']).optional(),

  DAILY_API_KEY: optional,
  ELEVENLABS_API_KEY: optional,

  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: optional,

  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_WHATSAPP_NUMBER: optional,

  /** S3-compatible storage (Cloudflare R2, AWS S3, …) for uploads */
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  /** Public base URL the bucket is served from, e.g. https://files.myadhikaar.com */
  S3_PUBLIC_URL: optional,

  /** Set to false to stop running the scheduled jobs on this instance */
  CRON_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
