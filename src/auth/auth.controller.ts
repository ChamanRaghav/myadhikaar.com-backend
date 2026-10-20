import { Body, Controller, Get, HttpCode, Post, Put, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public } from '../common/decorators.js';
import { AuthService } from './auth.service.js';
import { GoogleLoginDto, RefreshDto, RequestCodeDto, UpdateMeDto, VerifyCodeDto } from './dto.js';
import { TokensService } from './tokens.service.js';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
  ) {}

  @Post('otp/request')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestCode(@Body() body: RequestCodeDto, @Req() req: Request) {
    return this.auth.requestCode(body.email, meta(req));
  }

  @Post('otp/verify')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyCode(@Body() body: VerifyCodeDto, @Req() req: Request) {
    return this.auth.verifyCode(body.email, body.code, body.full_name, meta(req));
  }

  @Post('google')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  google(@Body() body: GoogleLoginDto, @Req() req: Request) {
    return this.auth.googleLogin(body.credential, meta(req));
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body() body: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(body.refresh_token, meta(req));
  }

  @Post('logout')
  @Public()
  @HttpCode(200)
  async logout(@Body() body: RefreshDto) {
    await this.tokens.revoke(body.refresh_token);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Put('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() body: UpdateMeDto) {
    return this.auth.updateMe(user.id, { ...body });
  }
}
