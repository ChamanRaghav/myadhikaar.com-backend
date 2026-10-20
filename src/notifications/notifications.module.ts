import { Module } from '@nestjs/common';
import { EntitiesModule } from '../entities/entities.module.js';
import { NotificationsService } from './notifications.service.js';
import { TwilioClient } from './twilio.client.js';
import { WhatsAppController } from './whatsapp.controller.js';

@Module({
  imports: [EntitiesModule],
  controllers: [WhatsAppController],
  providers: [NotificationsService, TwilioClient],
  exports: [NotificationsService],
})
export class NotificationsModule {}
