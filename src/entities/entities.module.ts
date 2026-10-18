import { Global, Module } from '@nestjs/common';
import { EntitiesController } from './entities.controller.js';
import { EntitiesService } from './entities.service.js';
import { EntityEvents } from './entity-events.js';
import { EntityRegistry } from './entity-registry.js';

@Global()
@Module({
  controllers: [EntitiesController],
  providers: [EntitiesService, EntityRegistry, EntityEvents],
  exports: [EntitiesService, EntityEvents],
})
export class EntitiesModule {}
