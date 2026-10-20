import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public } from '../common/decorators.js';
import { FunctionsService } from './functions.service.js';

/** POST /api/functions/:name — what the frontend's functions.invoke() calls. Each function checks login itself. */
@Controller('functions')
@Public()
export class FunctionsController {
  constructor(private readonly functions: FunctionsService) {}

  @Post(':name')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  invoke(@Param('name') name: string, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser | undefined) {
    return this.functions.invoke(name, body ?? {}, user);
  }
}
