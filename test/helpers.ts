import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { GoogleVerifier, GoogleProfile } from '../src/auth/google-verifier.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';


/** Google tokens in tests are JSON profiles; "bad" fails verification. */
export class FakeGoogleVerifier {
  async verify(credential: string): Promise<GoogleProfile> {
    if (credential.startsWith('bad')) throw new (await import('@nestjs/common')).UnauthorizedException('Invalid Google credential');
    return JSON.parse(credential.replace(/^google:/, ''));
  }
}

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  mail: MailService;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function createTestApp(customize?: (b: TestingModuleBuilder) => TestingModuleBuilder): Promise<TestApp> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GoogleVerifier)
    .useClass(FakeGoogleVerifier);
  if (customize) builder = customize(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true, logger: ['error'] });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return {
    app,
    prisma,
    mail: app.get(MailService),
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

/** Empties every table except Prisma's migration history. */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

/** Logs in through the real OTP flow and returns tokens for the user. */
export async function login(t: TestApp, email: string, role?: 'admin') {
  await t.http().post('/api/auth/otp/request').send({ email }).expect(200);
  const sent = [...t.mail.outbox].reverse().find((m) => m.to === email.toLowerCase());
  const code = /letter-spacing:6px;margin:16px 0">(\d{6})</.exec(sent!.html)![1];
  const res = await t.http().post('/api/auth/otp/verify').send({ email, code }).expect(200);
  if (role) await t.prisma.user.update({ where: { email: email.toLowerCase() }, data: { role } });
  return { token: res.body.access_token as string, refresh: res.body.refresh_token as string, user: res.body.user };
}
