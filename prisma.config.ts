import { defineConfig } from 'prisma/config';

// Local development reads .env; on Railway the variables are injected.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
