import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { POLICIES } from './policies.js';
import type { EntityMeta, FieldType } from './query.js';

interface RuntimeModel {
  fields: { name: string; kind: string; type: string }[];
}

/** Field metadata for every entity exposed through the API (those with a policy). */
@Injectable()
export class EntityRegistry {
  private readonly entities = new Map<string, EntityMeta>();

  constructor(prisma: PrismaService) {
    const models = (prisma as unknown as { _runtimeDataModel?: { models: Record<string, RuntimeModel> } })
      ._runtimeDataModel?.models;
    if (!models) throw new Error('Prisma runtime data model not found; check the Prisma client version');
    for (const name of Object.keys(POLICIES)) {
      const model = models[name];
      if (!model) throw new Error(`Access policy defined for unknown model ${name}`);
      const fields = new Map(
        model.fields.filter((f) => f.kind === 'scalar').map((f) => [f.name, f.type as FieldType] as const),
      );
      const delegate = (prisma as unknown as Record<string, unknown>)[name.charAt(0).toLowerCase() + name.slice(1)];
      if (!delegate) throw new Error(`No Prisma delegate for ${name}`);
      this.entities.set(name, { name, fields, delegate });
    }
  }

  get(name: string): EntityMeta {
    const meta = this.entities.get(name);
    if (!meta) throw new NotFoundException(`Unknown entity ${name}`);
    return meta;
  }
}
