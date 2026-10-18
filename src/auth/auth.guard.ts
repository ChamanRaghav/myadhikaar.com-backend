import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../common/auth-user.js';
import { ADMIN_ONLY, IS_PUBLIC } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokensService } from './tokens.service.js';

/**
 * Global guard. Attaches the user for any valid Bearer token and requires one unless the
 * route is @Public(). A token that is sent but invalid is always rejected with 401, so the
 * client refreshes instead of silently continuing as a guest.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets);

    const header: string | undefined = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      req.user = await this.authenticate(header.slice(7));
      if (!req.user) throw new UnauthorizedException('Invalid or expired token');
    }
    if (!req.user && !isPublic) throw new UnauthorizedException('Login required');
    if (adminOnly && req.user?.role !== 'admin') throw new ForbiddenException('Admins only');
    return true;
  }

  private async authenticate(token: string): Promise<AuthUser | undefined> {
    try {
      const payload = await this.tokens.verifyAccess(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, full_name: true, disabled: true },
      });
      if (!user || user.disabled) return undefined;
      return { id: user.id, email: user.email, role: user.role, full_name: user.full_name };
    } catch {
      return undefined;
    }
  }
}
