import { Module } from '@nestjs/common';
import { CashfreeClient } from './cashfree.client.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, CashfreeClient],
  exports: [PaymentsService],
})
export class PaymentsModule {}
