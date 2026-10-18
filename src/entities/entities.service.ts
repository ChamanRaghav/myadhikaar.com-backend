import { ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntityEvents } from './entity-events.js';
import { EntityRegistry } from './entity-registry.js';
import { POLICIES, type Access, type EntityPolicy } from './policies.js';
import { PolicyContext } from './policy-context.js';
import { buildOrderBy, buildWhere, cleanData, sameValue, serialize, type EntityMeta, type Where } from './query.js';

export interface ListOptions {
  filter?: Record<string, unknown>;
  sort?: string;
  limit?: number;
  skip?: number;
}

type Row = Record<string, unknown>;

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

@Injectable()
export class EntitiesService {
  private readonly logger = new Logger(EntitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: EntityRegistry,
    private readonly events: EntityEvents,
  ) {}

  context(user?: AuthUser): PolicyContext {
    return new PolicyContext(user, this.prisma);
  }

  async list(entity: string, user: AuthUser | undefined, opts: ListOptions): Promise<Row[]> {
    const { meta, policy, ctx } = this.resolve(entity, user);
    const filter = opts.filter ?? {};
    const where = buildWhere(meta, filter);
    let access: Access = true;
    if (!ctx.isAdmin) {
      if (policy.requireFilter && typeof filter[policy.requireFilter] !== 'string') {
        throw new ForbiddenException(`Look up ${entity} by ${policy.requireFilter}`);
      }
      access = await policy.read(ctx, filter);
      if (access === false) return [];
    }
    const rows: Row[] = await meta.delegate.findMany({
      where: merge(where, access),
      orderBy: buildOrderBy(meta, opts.sort),
      take: Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT),
      skip: Math.max(opts.skip ?? 0, 0),
    });
    return rows.map((row) => this.present(policy, ctx, row));
  }

  async get(entity: string, user: AuthUser | undefined, id: string): Promise<Row> {
    const { meta, policy, ctx } = this.resolve(entity, user);
    const access = ctx.isAdmin ? true : await policy.read(ctx, { id });
    if (access === false || (policy.requireFilter && !ctx.isAdmin)) throw new NotFoundException(`${entity} not found`);
    const row = await meta.delegate.findFirst({ where: merge({ id }, access) });
    if (!row) throw new NotFoundException(`${entity} not found`);
    return this.present(policy, ctx, row);
  }

  async create(entity: string, user: AuthUser | undefined, body: unknown): Promise<Row> {
    const { meta, policy, ctx } = this.resolve(entity, user);
    let data = cleanData(meta, body, this.logger);
    if (!ctx.isAdmin) {
      const rule = policy.create;
      if (!rule) throw this.denied(ctx, `You can't create ${entity} records`);
      if (rule.who === 'user' && !ctx.user) throw new UnauthorizedException('Login required');
      for (const field of rule.protect ?? []) delete data[field];
      if (rule.force) data = { ...data, ...cleanData(meta, await rule.force(ctx, data)) };
      await rule.check?.(ctx, data);
    }
    const row: Row = await meta.delegate.create({
      data: { ...data, created_by: user?.email ?? null, created_by_id: user?.id ?? null },
    });
    this.events.created(entity, row);
    return this.present(policy, ctx, row);
  }

  async update(entity: string, user: AuthUser | undefined, id: string, body: unknown): Promise<Row> {
    const { meta, policy, ctx } = this.resolve(entity, user);
    const patch = cleanData(meta, body, this.logger);
    if (ctx.isAdmin) {
      const exists = await meta.delegate.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundException(`${entity} not found`);
      return this.present(policy, ctx, await meta.delegate.update({ where: { id }, data: patch }));
    }

    const rule = policy.update;
    if (!rule) throw this.denied(ctx, `You can't change ${entity} records`);
    if ((rule.who ?? 'user') === 'user' && !ctx.user) throw new UnauthorizedException('Login required');
    const rows = await rule.rows(ctx);
    const existing: Row | null = rows === false ? null : await meta.delegate.findFirst({ where: merge({ id }, rows) });
    if (!existing) throw new NotFoundException(`${entity} not found`);

    const data: Row = {};
    for (const [field, value] of Object.entries(patch)) {
      if (rule.counters?.includes(field)) {
        data[field] = { increment: 1 };
      } else if (rule.fields.includes(field)) {
        const allowed = rule.values?.[field];
        if (allowed && !allowed.includes(value)) throw new ForbiddenException(`You can't set ${field} to "${value}"`);
        data[field] = value;
      } else if (!sameValue(existing[field], value)) {
        // Forms often resend the whole record; unchanged protected fields are fine
        throw new ForbiddenException(`You can't change ${field}`);
      }
    }
    const row = Object.keys(data).length ? await meta.delegate.update({ where: { id }, data }) : existing;
    return this.present(policy, ctx, row);
  }

  async remove(entity: string, user: AuthUser | undefined, id: string): Promise<{ success: true }> {
    const { meta, policy, ctx } = this.resolve(entity, user);
    if (!ctx.isAdmin) {
      if (!policy.remove) throw this.denied(ctx, `You can't delete ${entity} records`);
      const rows = await policy.remove.rows(ctx);
      const existing = rows === false ? null : await meta.delegate.findFirst({ where: merge({ id }, rows), select: { id: true } });
      if (!existing) throw new NotFoundException(`${entity} not found`);
    }
    const { count } = await meta.delegate.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException(`${entity} not found`);
    return { success: true };
  }

  private resolve(entity: string, user: AuthUser | undefined): { meta: EntityMeta; policy: EntityPolicy; ctx: PolicyContext } {
    return { meta: this.registry.get(entity), policy: POLICIES[entity], ctx: this.context(user) };
  }

  private present(policy: EntityPolicy, ctx: PolicyContext, row: Row): Row {
    const showHidden = ctx.isAdmin || (policy.showHidden?.(ctx, row) ?? false);
    return serialize(row, showHidden ? undefined : policy.hidden);
  }

  private denied(ctx: PolicyContext, message: string) {
    return ctx.user ? new ForbiddenException(message) : new UnauthorizedException('Login required');
  }
}

function merge(where: Where, access: Access): Where {
  if (access === true) return where;
  if (access === false) return { id: { in: [] } };
  return Object.keys(where).length ? { AND: [where, access] } : access;
}
