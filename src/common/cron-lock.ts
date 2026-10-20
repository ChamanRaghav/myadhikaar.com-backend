import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Runs a scheduled job on one instance at a time: holds a Postgres advisory lock for the
 * job's duration and skips the run when another instance already holds it.
 */
export async function runExclusive(prisma: PrismaService, name: string, job: () => Promise<void>): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${'cron:' + name})) AS locked`;
      if (!locked) return false;
      await job();
      return true;
    },
    { maxWait: 10_000, timeout: 10 * 60_000 },
  );
}
