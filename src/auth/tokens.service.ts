import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../config/env.js';
import { newId } from '../common/ids.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { User } from '../generated/prisma/client.js';

export interface AccessPayload {
  sub: string;
  email: string;
  role: string;
}

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

/** Another tab may refresh with the same token at the same moment; don't treat that as theft. */
const ROTATION_GRACE_MS = 30_000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issue(user: Pick<User, 'id' | 'email' | 'role'>, meta: ClientMeta, familyId = newId()): Promise<TokenPair> {
    const expiresIn = this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    const access_token = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role } satisfies AccessPayload, {
      expiresIn,
    });
    const refresh_token = randomBytes(32).toString('base64url');
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    await this.prisma.refreshToken.create({
      data: {
        user_id: user.id,
        token_hash: sha256(refresh_token),
        family_id: familyId,
        expires_at: new Date(Date.now() + days * 86_400_000),
        ip: meta.ip,
        user_agent: meta.userAgent?.slice(0, 300),
      },
    });
    return { access_token, refresh_token, token_type: 'Bearer', expires_in: expiresIn };
  }

  verifyAccess(token: string): Promise<AccessPayload> {
    return this.jwt.verifyAsync<AccessPayload>(token);
  }

  /** Swaps a refresh token for a new pair. Reusing an already-rotated token revokes its whole family. */
  async rotate(refreshToken: string, meta: ClientMeta): Promise<{ user: User; tokens: TokenPair }> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { token_hash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!row) throw new UnauthorizedException('Invalid refresh token');
    if (row.revoked_at) {
      if (Date.now() - row.revoked_at.getTime() > ROTATION_GRACE_MS) {
        await this.revokeFamily(row.family_id);
      }
      throw new UnauthorizedException('Refresh token already used');
    }
    if (row.expires_at.getTime() < Date.now() || row.user.disabled) {
      throw new UnauthorizedException('Refresh token expired');
    }
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    if (count === 0) throw new UnauthorizedException('Refresh token already used');
    return { user: row.user, tokens: await this.issue(row.user, meta, row.family_id) };
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token_hash: sha256(refreshToken), revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { family_id: familyId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }
}
