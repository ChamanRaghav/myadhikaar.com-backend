import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { importFromBase44, type PageReader } from '../src/migration/base44-import.js';
import { createTestApp, resetDb, type TestApp } from './helpers.js';

const DATA: Record<string, Record<string, unknown>[]> = {
  User: [
    { id: 'aaaaaaaaaaaaaaaaaaaaaaa1', email: 'Admin@Example.com', full_name: 'Admin', role: 'admin', phone: '98765', referral_code: 'X1', created_date: '2025-03-01T10:00:00.000000' },
    { id: 'aaaaaaaaaaaaaaaaaaaaaaa2', email: 'user@example.com', role: 'user', created_date: '2025-04-01T10:00:00.000000' },
    { id: 'aaaaaaaaaaaaaaaaaaaaaaa3', role: 'user' },
  ],
  Lawyer: [
    {
      id: 'bbbbbbbbbbbbbbbbbbbbbbb1',
      full_name: 'Adv. Rao',
      email: 'RAO@example.com',
      consultation_rate: '600',
      specializations: ['bail', 'criminal'],
      is_online: true,
      legacy_field: 'x',
      created_date: '2025-05-01T08:30:00.000000',
      created_by: 'admin@example.com',
    },
  ],
  Blog: Array.from({ length: 5 }, (_, i) => ({ id: `ccccccccccccccccccccccc${i}`, title: `Post ${i}`, is_published: i % 2 === 0, created_date: '2025-06-01T00:00:00Z' })),
};

/** Serves DATA two records per page, like Base44's cursor API. */
const reader: PageReader = async (entity, cursor) => {
  const all = DATA[entity] ?? [];
  const start = cursor ? Number(cursor) : 0;
  return { items: all.slice(start, start + 2), next_cursor: start + 2 < all.length ? String(start + 2) : null };
};

describe('Base44 import', () => {
  let t: TestApp;
  const log = () => undefined;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  it('copies records with their ids, dates and types', async () => {
    const reports = await importFromBase44(t.prisma, reader, { log });
    expect(reports.find((r) => r.entity === 'Blog')).toMatchObject({ read: 5, inserted: 5 });

    const lawyer = await t.prisma.lawyer.findUniqueOrThrow({ where: { id: 'bbbbbbbbbbbbbbbbbbbbbbb1' } });
    expect(lawyer).toMatchObject({ email: 'rao@example.com', consultation_rate: 600, specializations: ['bail', 'criminal'], is_online: true });
    expect(lawyer.created_date.toISOString()).toBe('2025-05-01T08:30:00.000Z');
    expect(reports.find((r) => r.entity === 'Lawyer')!.droppedFields).toEqual({ legacy_field: 1 });

    const admin = await t.prisma.user.findUniqueOrThrow({ where: { id: 'aaaaaaaaaaaaaaaaaaaaaaa1' } });
    expect(admin).toMatchObject({ email: 'admin@example.com', role: 'admin', phone: '98765', data: { referral_code: 'X1' } });
    expect(admin.last_login_at).toBeTruthy();
    expect(reports.find((r) => r.entity === 'User')).toMatchObject({ read: 3, inserted: 2, skipped: 1 });
  });

  it('is safe to re-run, and --replace refreshes changed records', async () => {
    await importFromBase44(t.prisma, reader, { log });
    const again = await importFromBase44(t.prisma, reader, { log });
    expect(again.every((r) => r.inserted === 0)).toBe(true);
    expect(await t.prisma.blog.count()).toBe(5);

    DATA.Blog[0].title = 'Edited';
    DATA.User[1].full_name = 'Renamed';
    await importFromBase44(t.prisma, reader, { log, replace: true });
    expect((await t.prisma.blog.findUniqueOrThrow({ where: { id: 'ccccccccccccccccccccccc0' } })).title).toBe('Edited');
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: 'aaaaaaaaaaaaaaaaaaaaaaa2' } })).full_name).toBe('Renamed');
  });

  it('migrated users can log in and see their data without a welcome email', async () => {
    await importFromBase44(t.prisma, reader, { log });
    t.mail.outbox.length = 0;
    await t.http().post('/api/auth/otp/request').send({ email: 'user@example.com' }).expect(200);
    const code = /(\d{6})</.exec(t.mail.outbox.at(-1)!.html)![1];
    const res = await t.http().post('/api/auth/otp/verify').send({ email: 'user@example.com', code }).expect(200);
    expect(res.body.user.id).toBe('aaaaaaaaaaaaaaaaaaaaaaa2');
    await new Promise((r) => setTimeout(r, 100));
    expect(t.mail.outbox.some((m) => m.subject.includes('Welcome'))).toBe(false);
  });

  it('writes nothing on a dry run', async () => {
    await importFromBase44(t.prisma, reader, { log, dryRun: true });
    expect(await t.prisma.lawyer.count()).toBe(0);
  });
});
