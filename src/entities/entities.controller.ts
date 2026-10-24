import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public } from '../common/decorators.js';
import { EntitiesService } from './entities.service.js';

function parseFilter(q?: string): Record<string, unknown> | undefined {
  if (!q) return undefined;
  try {
    return JSON.parse(q);
  } catch {
    throw new BadRequestException('q must be a JSON object');
  }
}

const int = (v?: string) => (v === undefined || v === '' ? undefined : Number.parseInt(v, 10) || undefined);

/**
 * Base44-compatible record API. Routes are public at the HTTP level; each entity's policy
 * decides what guests, users and admins may do.
 *
 *   GET    /entities/Lawyer?q={"status":"active"}&sort=-rating&limit=20&skip=0
 *   GET    /entities/Lawyer/:id
 *   POST   /entities/Consultation          (body = record)
 *   PUT    /entities/Consultation/:id      (body = changed fields)
 *   DELETE /entities/FleetVehicle/:id
 */
@Controller('entities/:entity')
@Public()
export class EntitiesController {
  constructor(private readonly entities: EntitiesService) {}

  @Get()
  list(
    @Param('entity') entity: string,
    @CurrentUser() user: AuthUser | undefined,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.entities.list(entity, user, { filter: parseFilter(q), sort, limit: int(limit), skip: int(skip) });
  }

  @Get(':id')
  get(@Param('entity') entity: string, @Param('id') id: string, @CurrentUser() user: AuthUser | undefined) {
    return this.entities.get(entity, user, id);
  }

  @Post()
  create(@Param('entity') entity: string, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser | undefined) {
    return this.entities.create(entity, user, body);
  }

  @Post('bulk')
  async bulkCreate(@Param('entity') entity: string, @Body() body: unknown, @CurrentUser() user: AuthUser | undefined) {
    if (!Array.isArray(body) || body.length > 500) throw new BadRequestException('Body must be an array of up to 500 records');
    const created = [];
    for (const record of body) created.push(await this.entities.create(entity, user, record));
    return created;
  }

  @Put(':id')
  update(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    return this.entities.update(entity, user, id, body);
  }

  /** Same as PUT: updates are always partial. (Stacked route decorators register only one method.) */
  @Patch(':id')
  patch(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    return this.entities.update(entity, user, id, body);
  }

  @Delete(':id')
  remove(@Param('entity') entity: string, @Param('id') id: string, @CurrentUser() user: AuthUser | undefined) {
    return this.entities.remove(entity, user, id);
  }
}
