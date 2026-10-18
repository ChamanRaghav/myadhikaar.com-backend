import { ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { User } from '../generated/prisma/client.js';
import { userView } from '../users/user-view.js';
import { GoogleVerifier } from './google-verifier.js';
import { ClientMeta, TokensService } from './tokens.service.js';

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 5;
const CODE_WINDOW_MS = 15 * 60_000;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
    private readonly google: GoogleVerifier,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async requestCode(rawEmail: string, meta: ClientMeta): Promise<{ ok: true }> {
    const email = normalizeEmail(rawEmail);
    const recent = await this.prisma.otpCode.count({
      where: { email, created_date: { gt: new Date(Date.now() - CODE_WINDOW_MS) } },
    });
    if (recent >= MAX_CODES_PER_WINDOW) {
      throw new HttpException('Too many codes requested. Try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.otpCode.create({
      data: { email, code_hash: this.hashCode(email, code), expires_at: new Date(Date.now() + CODE_TTL_MS), ip: meta.ip },
    });
    await this.mail.sendTemplate('login_code', email, { code });
    return { ok: true };
  }

  async verifyCode(rawEmail: string, code: string, fullName: string | undefined, meta: ClientMeta) {
    const email = normalizeEmail(rawEmail);
    const otp = await this.prisma.otpCode.findFirst({
      where: { email, consumed_at: null, expires_at: { gt: new Date() } },
      orderBy: { created_date: 'desc' },
    });
    if (!otp) throw new UnauthorizedException('Code expired. Request a new one.');
    if (otp.attempts >= MAX_ATTEMPTS) throw new UnauthorizedException('Too many wrong attempts. Request a new code.');

    const expected = Buffer.from(otp.code_hash, 'hex');
    const given = Buffer.from(this.hashCode(email, code), 'hex');
    if (!timingSafeEqual(expected, given)) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('Incorrect code');
    }
    const { count } = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, consumed_at: null },
      data: { consumed_at: new Date() },
    });
    if (count === 0) throw new UnauthorizedException('Code already used');

    const user = await this.prisma.user.upsert({
      where: { email },
      create: { email, full_name: fullName?.trim() || null },
      update: {},
    });
    return this.login(user, meta);
  }

  async googleLogin(credential: string, meta: ClientMeta) {
    const profile = await this.google.verify(credential);
    const email = normalizeEmail(profile.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            google_sub: existing.google_sub ?? profile.sub,
            full_name: existing.full_name ?? profile.name ?? null,
            avatar_url: existing.avatar_url ?? profile.picture ?? null,
          },
        })
      : await this.prisma.user.create({
          data: { email, google_sub: profile.sub, full_name: profile.name ?? null, avatar_url: profile.picture ?? null },
        });
    return this.login(user, meta);
  }

  async refresh(refreshToken: string, meta: ClientMeta) {
    const { user, tokens } = await this.tokens.rotate(refreshToken, meta);
    return { ...tokens, user: await this.view(user) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.view(user);
  }

  async updateMe(userId: string, patch: Record<string, unknown>) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: patch });
    return this.view(user);
  }

  private async login(user: User, meta: ClientMeta) {
    if (user.disabled) throw new ForbiddenException('This account is disabled');
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } });
    const tokens = await this.tokens.issue(updated, meta);
    return { ...tokens, user: await this.view(updated) };
  }

  /** Adds lawyerId, which the frontend reads for advocates (Base44 exposed it on the user). */
  private async view(user: User) {
    const lawyer = await this.prisma.lawyer.findFirst({
      where: { email: { equals: user.email, mode: 'insensitive' } },
      select: { id: true },
    });
    return userView(user, lawyer ? { lawyerId: lawyer.id } : {});
  }

  private hashCode(email: string, code: string): string {
    return createHmac('sha256', this.config.get('JWT_SECRET', { infer: true })).update(`${email}:${code}`).digest('hex');
  }
}
