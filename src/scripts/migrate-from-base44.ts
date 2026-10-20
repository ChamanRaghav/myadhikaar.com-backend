/**
 * Copies all data from the Base44 app into Postgres.
 *
 *   BASE44_APP_ID=… BASE44_TOKEN=… DATABASE_URL=… node dist/scripts/migrate-from-base44.js [--dry-run] [--replace] [--only=Lawyer,Blog]
 *
 * BASE44_TOKEN is an app admin's access token: sign in to the live site as an admin and copy
 * localStorage "base44_access_token" from the browser console. Run migrations first.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { base44Reader, importFromBase44 } from '../migration/base44-import.js';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean);

const { BASE44_APP_ID, BASE44_TOKEN, BASE44_SERVER_URL, DATABASE_URL } = process.env;
if (!BASE44_APP_ID || !BASE44_TOKEN || !DATABASE_URL) {
  console.error('Set BASE44_APP_ID, BASE44_TOKEN and DATABASE_URL');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
const started = Date.now();
try {
  const reports = await importFromBase44(prisma, base44Reader({ appId: BASE44_APP_ID, token: BASE44_TOKEN, serverUrl: BASE44_SERVER_URL }), {
    dryRun: flag('dry-run'),
    replace: flag('replace'),
    only,
  });
  const total = reports.reduce((n, r) => n + r.read, 0);
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(0)}s: ${total} records read${flag('dry-run') ? ' (dry run, nothing written)' : ''}.`);
} catch (err) {
  console.error(`Migration failed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
