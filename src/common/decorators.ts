import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC = 'isPublic';
export const ADMIN_ONLY = 'adminOnly';

/** Route works without a login; the user is still attached when a valid token is sent. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route requires a logged-in admin. */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser | undefined => ctx.switchToHttp().getRequest().user,
);
