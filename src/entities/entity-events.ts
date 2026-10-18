import { Injectable, Logger } from '@nestjs/common';

type Listener = (record: Record<string, any>) => Promise<unknown> | unknown;

/** Replaces Base44's "on create" automations: modules subscribe to new records of an entity. */
@Injectable()
export class EntityEvents {
  private readonly logger = new Logger(EntityEvents.name);
  private readonly listeners = new Map<string, Listener[]>();

  onCreate(entity: string, listener: Listener): void {
    this.listeners.set(entity, [...(this.listeners.get(entity) ?? []), listener]);
  }

  /** Listeners run in the background; their failures are logged, never thrown at the caller. */
  created(entity: string, record: Record<string, any>): void {
    for (const listener of this.listeners.get(entity) ?? []) {
      Promise.resolve()
        .then(() => listener(record))
        .catch((err: Error) => this.logger.warn(`on-create ${entity} listener failed: ${err.message}`));
    }
  }
}
