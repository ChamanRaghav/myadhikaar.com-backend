import { Global, Module } from '@nestjs/common';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import { AiService } from './ai.service.js';

@Global()
@Module({
  controllers: [AgentsController],
  providers: [AiService, AgentsService],
  exports: [AiService],
})
export class AiModule {}
