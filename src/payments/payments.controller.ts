import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public } from '../common/decorators.js';
import { CreatePaymentDto, QuoteDto } from './dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** What an order will cost; the frontend shows this before paying. */
  @Post('quote')
  @Public()
  @HttpCode(200)
  quote(@Body() body: QuoteDto) {
    return this.payments.quote(body);
  }

  @Post('orders')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser, @Body() body: CreatePaymentDto) {
    return this.payments.create(user, body);
  }

  /** Return pages call this; it confirms the payment with Cashfree and fulfils the order. */
  @Get('orders/:id')
  verify(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.verify(user, id);
  }

  @Post('webhook/cashfree')
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-timestamp') timestamp?: string,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    return this.payments.webhook(req.rawBody?.toString('utf8') ?? '', timestamp, signature);
  }
}
