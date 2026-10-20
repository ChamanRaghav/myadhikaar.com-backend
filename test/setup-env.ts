// Runs before test files are imported: AppModule validates the environment at import time.
export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? 'postgresql://myadhikaar:myadhikaar@localhost:5433/myadhikaar_test?schema=public',
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  APP_URL: 'https://myadhikaar.test',
  ADMIN_EMAILS: 'admin-inbox@myadhikaar.test,support@myadhikaar.test',
  GOOGLE_CLIENT_ID: 'test-google-client',
  RESEND_API_KEY: '',
  CRON_ENABLED: 'false',
};
Object.assign(process.env, TEST_ENV);
