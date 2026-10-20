import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { CommunityService } from './community.service.js';
import { DailyService } from './daily.service.js';
import { FunctionsController } from './functions.controller.js';
import { FunctionsService } from './functions.service.js';
import { TtsService } from './tts.service.js';

@Module({
  imports: [PaymentsModule, SessionsModule],
  controllers: [FunctionsController],
  providers: [FunctionsService, DailyService, TtsService, CommunityService],
})
export class FunctionsModule {}
