import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.js';
import { StorageService } from './storage.service.js';

@Module({
  controllers: [IntegrationsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class IntegrationsModule {}
